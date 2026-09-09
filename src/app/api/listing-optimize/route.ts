import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { getCategory, readAttributes, attributeEntries } from "@/lib/categories";
import { canonicalCondition, conditionLabel } from "@/lib/listingOptions";

// AI listing OPTIMIZER. Distinct from /api/listing-assist (which drafts a
// listing from scratch). This takes a seller's EXISTING listing and makes it
// "more likely to be seen" — a keyword-rich, search-optimized title and
// description grounded in how buyers search, plus a non-destructive photo
// presentation plan (best-first ordering, per-shot tips, missing-shot
// checklist). It never edits the seller's photos; it advises on presentation.

const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY;

const SYSTEM_PROMPT = `You are a marketplace SEO specialist and merchandiser for This'n'that, a general resale marketplace where people sell anything they own.
Your job is to make an existing listing MORE DISCOVERABLE and better presented so it sells.

DISCOVERABILITY rules for title + description:
- Lead the title with the terms buyers actually search: brand, what the item is, model or style name, size, colour, era and other attributes given. Include high-signal modifiers only when they are TRUE for this item per the details or photos ("vintage", "deadstock", "complete in box", "first edition", "handmade"...). Never invent claims not supported by the listing or photos.
- Title <= 80 chars, front-load the most-searched words, no ALL CAPS spam, no emoji.
- Description: 2-4 short, scannable sentences/lines. Naturally weave in searchable terms (brand, item, model, size, material, era, condition) without keyword-stuffing. Stay honest about condition and flaws. End with a soft, friendly closing line.
- keywords: 8-15 lowercase search phrases a buyer would type (brand + item, model numbers, size, colour, era, common synonyms). No duplicates.

PHOTO PRESENTATION rules (NON-DESTRUCTIVE — never claim to edit the image):
- recommendedOrder: array of 0-based indices reordering the GIVEN photos best-first. The strongest cover is a sharp, well-lit, centered full shot of the item on a clean background. Detail shots, labels and flaw shots come after the hero.
- coverIndex: which given index should be the cover (usually recommendedOrder[0]).
- tips: 3-6 concrete, friendly presentation tips based on what you SEE (lighting, background clutter, blur, framing, glare). Be specific to these photos.
- missingShots: shots buyers expect for this kind of item that appear to be MISSING (e.g. "label or maker's mark close-up", "back of the item", "full front on a plain background", "close-up of any flaw", "size tag"). Empty array if all key shots are present.

Respond ONLY with a JSON object with these exact keys:
{
  "optimizedTitle": string,
  "optimizedDescription": string,
  "keywords": string[],
  "photoPlan": {
    "recommendedOrder": number[],
    "coverIndex": number,
    "tips": string[],
    "missingShots": string[]
  }
}`;

export async function POST(req: Request) {
  const limited = rateLimit(req, "listing-optimize", 12, 60_000);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!OPENAI_KEY) {
    return NextResponse.json(
      { error: "AI optimizer isn't set up on this server (OPENAI_API_KEY missing)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const str = (v: unknown, n = 300) =>
    typeof v === "string" ? v.trim().slice(0, n) : "";
  const title = str(body?.title, 200);
  const brand = str(body?.brand, 80);
  const itemName = str(body?.itemName, 160);
  const categorySlug = str(body?.categorySlug, 60);
  const description = str(body?.description, 4000);
  const condition = canonicalCondition(body?.condition);
  const category = getCategory(categorySlug);
  const attrs = category
    ? attributeEntries(category, readAttributes(body?.attributes)).filter((e) =>
        category.attributes.some((f) => f.key === e.key),
      )
    : [];
  const photos: string[] = Array.isArray(body?.photos)
    ? body.photos.filter((p: unknown) => typeof p === "string").slice(0, 4)
    : [];
  // OpenAI can only fetch absolute http(s) image URLs. Relative paths (e.g. the
  // placeholder) make the API return 400, which we'd surface as a confusing
  // 502. Index space (n) below stays based on `photos` so the photo plan still
  // lines up with what the client sent.
  const apiPhotos = photos.filter((u) => /^https?:\/\//i.test(u));

  if (!title && !description && !itemName) {
    return NextResponse.json(
      { error: "Add a title, item name, or description to optimize." },
      { status: 400 },
    );
  }

  const userText = [
    "Optimize this listing for discoverability and presentation.",
    `Current title: ${title || "(none)"}`,
    `Item: ${itemName || "(none)"}`,
    `Brand: ${brand || "(none)"}`,
    `Category: ${category?.name ?? "(none)"}`,
    `Condition: ${condition ? conditionLabel(condition) : "(none)"}`,
    attrs.length
      ? `Details: ${attrs.map((a) => `${a.label}: ${a.value}`).join("; ")}`
      : "Details: (none)",
    `Current description: ${description || "(none)"}`,
    photos.length
      ? `There are ${photos.length} photo(s), provided in order (index 0 first).`
      : "No photos provided — return an empty photoPlan with helpful missingShots.",
  ].join("\n");

  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      // Cap the upstream call so a slow/hung OpenAI request fails cleanly here
      // instead of holding the connection open until the platform proxy returns
      // its own opaque 502/504.
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              ...apiPhotos.map((url) => ({
                type: "image_url" as const,
                image_url: { url },
              })),
            ],
          },
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
  if (!parsed) {
    return NextResponse.json({ error: "No suggestion produced." }, { status: 502 });
  }

  // Sanitize the photo plan so the order is always a valid permutation of the
  // provided photos (the model can hallucinate out-of-range indices).
  const plan = (parsed.photoPlan ?? {}) as Record<string, unknown>;
  const n = photos.length;
  const rawOrder = Array.isArray(plan.recommendedOrder)
    ? (plan.recommendedOrder as unknown[])
    : [];
  const seen = new Set<number>();
  const order: number[] = [];
  for (const v of rawOrder) {
    const i = Math.trunc(Number(v));
    if (Number.isInteger(i) && i >= 0 && i < n && !seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  }
  for (let i = 0; i < n; i++) if (!seen.has(i)) order.push(i); // append any missed
  const coverIndex = order.length ? order[0] : 0;

  const cleanStrArr = (v: unknown, max: number) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim())
          .slice(0, max)
      : [];

  return NextResponse.json({
    optimizedTitle: String(parsed.optimizedTitle ?? "").slice(0, 160),
    optimizedDescription: String(parsed.optimizedDescription ?? "").slice(0, 4000),
    keywords: cleanStrArr(parsed.keywords, 15),
    photoPlan: {
      recommendedOrder: order,
      coverIndex,
      tips: cleanStrArr(plan.tips, 6),
      missingShots: cleanStrArr(plan.missingShots, 6),
    },
  });
}
