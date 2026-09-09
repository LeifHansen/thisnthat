import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { BEANIES } from "@/lib/beanie-database";

// AI listing assistant: takes the seller's uploaded photo URLs and drafts a
// suggested title, beanie name, year, condition, description, and price — so
// starting a listing is fast. The photo pass is a DRAFTING aid only: it never
// links the listing to the catalogue database (image-based matching proved
// unreliable). Catalogue linking is driven by the seller's typed beanie name
// via the ranked text recommender (see src/lib/beanie-id.ts + BeanieCombobox).
// Pricing is grounded in our own Beanie database's value reference, layering
// in real eBay sold comps via the RapidAPI "ebay-average-selling-price"
// service (see ebaySoldComps below) when RAPIDAPI_KEY is configured.

const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY;

type EbayComps = {
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  count: number | null;
};

// Real eBay SOLD/completed-item comps via the RapidAPI
// "ebay-average-selling-price" service. Returns null if no key is configured
// or the call fails, so the assistant degrades gracefully.
async function ebaySoldComps(keywords: string): Promise<EbayComps | null> {
  if (!RAPIDAPI_KEY) return null;
  try {
    const res = await fetch(
      "https://ebay-average-selling-price.p.rapidapi.com/findCompletedItems",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "ebay-average-selling-price.p.rapidapi.com",
          "x-rapidapi-key": RAPIDAPI_KEY,
        },
        body: JSON.stringify({
          keywords,
          excluded_keywords: "lot bundle fake repro reproduction custom",
          max_search_results: "120",
          remove_outliers: true,
          site_id: "0",
        }),
        // Comps are a best-effort enrichment — never let them hang the request.
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    if (!d) return null;
    const num = (v: unknown) => {
      const n = typeof v === "string" ? parseFloat(v) : (v as number);
      return Number.isFinite(n) ? n : null;
    };
    return {
      average: num(d.average_price ?? d.average),
      median: num(d.median_price ?? d.median),
      min: num(d.min_price ?? d.min),
      max: num(d.max_price ?? d.max),
      count: num(d.total_results ?? d.results ?? d.products?.length) ?? null,
    };
  } catch {
    return null;
  }
}

// Compact pricing reference passed to the model so its estimates are grounded.
// Only curated entries carry value estimates — the expanded Ty-roster import
// is facts-only and would bloat the prompt with no pricing signal.
const PRICE_REFERENCE = BEANIES.filter(
  (b) => b.valueLow != null && b.valueHigh != null,
)
  .map((b) => `${b.name} (${b.animal}): $${b.valueLow}-$${b.valueHigh}`)
  .join("; ");

const SYSTEM_PROMPT = `You are an expert Ty Beanie Baby authenticator and marketplace copywriter for BeanieXchange.
From the seller's photos, identify the Beanie Baby and produce a high-quality marketplace listing.
Assess condition from what is visible (plush cleanliness, fading, the swing/hang tag and tush tag, tag protector).
Be honest and avoid hype. If you cannot identify it confidently, say so in "notes" and still give your best guess.

Ground your price estimate in this reference of typical values for an authentic example in excellent condition (actual value varies by tag generation, condition, and variation):
${PRICE_REFERENCE}

Respond ONLY with a JSON object with these exact keys:
{
  "beanieName": string,            // e.g. "Princess"
  "animal": string,                // e.g. "Bear"
  "year": number|null,             // introduction year if known
  "title": string,                 // compelling marketplace title, <= 80 chars
  "condition": string,             // short, e.g. "Mint with mint tag"
  "conditionNotes": string,        // what you observed
  "description": string,           // 2-3 sentence honest listing description
  "tagGeneration": string,         // best guess or "unknown"
  "priceLow": number,              // USD
  "priceHigh": number,             // USD
  "recommendedPrice": number,      // USD single suggested list price
  "confidence": "high"|"medium"|"low",
  "notes": string                  // caveats, authenticity flags, or ""
}`;

export async function POST(req: Request) {
  const limited = rateLimit(req, "listing-assist", 15, 60_000);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!OPENAI_KEY) {
    return NextResponse.json(
      { error: "AI assist is not configured (OPENAI_API_KEY missing)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const photos: string[] = Array.isArray(body?.photos)
    ? body.photos
        .filter((p: unknown) => typeof p === "string")
        // OpenAI vision can only read absolute http(s) URLs; drop anything else
        // (relative placeholders, data URIs) so it can't 400 → surface as a 502.
        .filter((p: string) => /^https?:\/\//i.test(p))
        .slice(0, 4)
    : [];
  const hint = typeof body?.hint === "string" ? body.hint.slice(0, 300) : "";

  if (photos.length === 0) {
    return NextResponse.json(
      { error: "Add at least one uploaded photo first." },
      { status: 400 },
    );
  }

  const userText =
    "Identify this Ty Beanie Baby and write the listing." +
    (hint ? ` Seller note: ${hint}` : "");

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
        max_tokens: 700,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              ...photos.map((url) => ({
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

  // The photo pass only DRAFTS the name as text — it does not link to the
  // catalogue. The seller reviews the suggested name and links it to a
  // catalogue entry through the ranked text recommender in the form.
  const beanieName = String(parsed.beanieName ?? "").trim();

  // Real eBay sold comps (if RAPIDAPI_KEY is configured). Search by beanie name.
  const ebay = await ebaySoldComps(`Ty Beanie Baby ${beanieName}`.trim());

  // Prefer the real median sold price when we have a meaningful sample.
  if (ebay?.median && (ebay.count ?? 0) >= 3) {
    parsed.recommendedPrice = Math.round(ebay.median);
    parsed.priceSource = "ebay_sold_median";
  } else {
    parsed.priceSource = "ai_estimate";
  }

  return NextResponse.json({
    suggestion: parsed,
    ebayComps: ebay,
  });
}
