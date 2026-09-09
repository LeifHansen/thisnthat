import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { getCategory, readAttributes, attributeEntries } from "@/lib/categories";
import { canonicalCondition, conditionLabel } from "@/lib/listingOptions";

// AI description writer. Given the details a seller has ALREADY typed into the
// listing form (title, brand, item name, category, condition, attributes), it
// drafts a single honest, buyer-friendly description — no photos required.
// Distinct from /api/listing-assist (drafts a whole listing from photos) and
// /api/listing-optimize (rewrites an existing listing for discoverability).

const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY;

const SYSTEM_PROMPT = `You are a marketplace copywriter for This'n'that, a general resale marketplace where people sell anything they own.
Write a single, honest listing description from the details the seller has already entered.

Rules:
- 2-4 short, warm, scannable sentences a buyer would want to read. No bullet lists, no headings, no markdown.
- Use ONLY facts the seller provided. Never invent condition, flaws, provenance, sizes, materials or authenticity claims that were not provided.
- Naturally weave in the brand, what the item is, and the attributes given (size, era, material, model...) when they are present.
- If the condition is given, describe it honestly in plain words.
- No hype, no ALL CAPS, no emoji, no price. End with a brief, friendly closing line.
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
      { error: "AI description isn't set up on this server (OPENAI_API_KEY missing)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const str = (v: unknown, n = 300) =>
    typeof v === "string" ? v.trim().slice(0, n) : "";
  const title = str(body?.title, 160);
  const brand = str(body?.brand, 80);
  const itemName = str(body?.itemName, 160);
  const categorySlug = str(body?.categorySlug, 60);
  const condition = canonicalCondition(body?.condition);
  const existing = str(body?.description, 2000);
  const category = getCategory(categorySlug);
  // Only the attributes the category actually defines, labelled for the model.
  const attrs = category
    ? attributeEntries(category, readAttributes(body?.attributes)).filter((e) =>
        category.attributes.some((f) => f.key === e.key),
      )
    : [];

  if ((itemName || title).length < 2) {
    return NextResponse.json(
      { error: "Add a title or say what the item is first." },
      { status: 400 },
    );
  }

  const userText = [
    "Write a listing description from these details.",
    `Title: ${title || "(not given)"}`,
    `Item: ${itemName || "(not given)"}`,
    `Brand: ${brand || "(not given)"}`,
    `Category: ${category?.name ?? "(not given)"}`,
    `Condition: ${condition ? conditionLabel(condition) : "(not given)"}`,
    attrs.length
      ? `Details: ${attrs.map((a) => `${a.label}: ${a.value}`).join("; ")}`
      : "Details: (none)",
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

  return NextResponse.json({ description });
}
