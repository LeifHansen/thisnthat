import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { resolveBeanie } from "@/lib/beanie-id";

// AI description writer. Given the details a seller has ALREADY typed into the
// listing form (beanie name, year, condition, hang-tag), it drafts a single
// honest, buyer-friendly description — no photos required. Grounded in our own
// Beanie catalogue so facts (animal, style number, intro year) are accurate.
// Distinct from /api/listing-assist (drafts a whole listing from photos) and
// /api/listing-optimize (rewrites an existing listing for discoverability).

const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY;

const SYSTEM_PROMPT = `You are a Ty Beanie Baby marketplace copywriter for BeanieXchange.
Write a single, honest listing description from the details the seller has already entered.

Rules:
- 2-4 short, warm, scannable sentences a collector would want to read. No bullet lists, no headings, no markdown.
- Use ONLY facts the seller provided plus the catalogue context given to you. Never invent condition, flaws, tag generation, or authenticity claims that were not provided.
- Naturally weave in the beanie's name, animal, and introduction year when known. You may mention the style number if it is in the catalogue context.
- If the condition is given, describe it honestly. If a hang-tag status is given, you may reference it naturally — do NOT start the description with a "Hang tag:" label line.
- No hype, no ALL CAPS, no emoji, no price. End with a gentle, collector-appropriate closing line.
- If a rough draft is provided, polish and expand it rather than discarding the seller's wording.

Respond ONLY with a JSON object: { "description": string }`;

export async function POST(req: Request) {
  const limited = rateLimit(req, "listing-describe", 15, 60_000);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!OPENAI_KEY) {
    return NextResponse.json(
      { error: "AI description is not configured (OPENAI_API_KEY missing)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const str = (v: unknown, n = 300) =>
    typeof v === "string" ? v.slice(0, n) : "";
  const beanieName = str(body?.beanieName, 120);
  const condition = str(body?.condition, 200);
  const year = body?.year ? String(body.year).slice(0, 8) : "";
  const existing = str(body?.description, 2000);
  // The form sends the hang-tag condition grade ("Mint" | "Good" | "Fair" |
  // "Missing"); legacy clients sent "yes"/"no". Map every real value so the
  // seller's hang-tag detail actually reaches the model.
  const hangTagRaw = str(body?.hangTag, 12).toLowerCase();
  const hangTag =
    hangTagRaw === "missing" || hangTagRaw === "no"
      ? "No hang tag"
      : hangTagRaw === "yes"
        ? "Still has its hang tag"
        : hangTagRaw
          ? `Hang tag present, ${hangTagRaw} condition`
          : "";

  if (beanieName.trim().length < 2) {
    return NextResponse.json(
      { error: "Add the Beanie's name first." },
      { status: 400 },
    );
  }

  // Confident resolution only (never guesses between beanies) — the old loose
  // substring matcher false-matched single-letter alphabet bears ("M", "P")
  // and grounded descriptions in the wrong beanie's catalogue facts.
  const db = resolveBeanie(beanieName) ?? undefined;
  const dbContext = db
    ? `Known catalogue facts — name: ${db.name}; animal: ${db.animal}; intro year: ${db.year ?? "?"}; style number: ${db.styleNumber ?? "?"}; Ty birthday: ${db.birthday ?? "?"}${db.note ? `; note: ${db.note}` : ""}.`
    : "No exact catalogue match — rely only on the details below.";

  const userText = [
    "Write a listing description from these details.",
    dbContext,
    `Beanie name: ${beanieName}`,
    `Year: ${year || "(not given)"}`,
    `Condition: ${condition || "(not given)"}`,
    `Hang tag: ${hangTag || "(not given)"}`,
    `Seller's rough draft: ${existing || "(none — write fresh)"}`,
  ].join("\n");

  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 400,
        temperature: 0.6,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
      }),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut
          ? "The AI service took too long. Please try again."
          : "Could not reach the AI service. Try again.",
      },
      { status: timedOut ? 504 : 502 },
    );
  }

  if (!aiRes.ok) {
    return NextResponse.json(
      { error: `AI service error (${aiRes.status}).` },
      { status: 502 },
    );
  }

  const data = await aiRes.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content;
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "AI returned an unexpected response. Try again." },
      { status: 502 },
    );
  }

  const description = String(parsed?.description ?? "").trim().slice(0, 4000);
  if (!description) {
    return NextResponse.json(
      { error: "No description produced. Try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    description,
    databaseMatch: db ? { name: db.name } : null,
  });
}
