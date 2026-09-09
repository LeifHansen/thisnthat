import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import {
  CATEGORIES,
  getCategory,
  isCategorySlug,
  validateAttributes,
  type Attributes,
} from "@/lib/categories";
import { CONDITIONS, canonicalCondition } from "@/lib/listingOptions";
import { soldPriceSummary } from "@/lib/ebay-sold";

// AI listing assistant: takes the seller's uploaded photo URLs and drafts a
// listing — title, brand, item name, category, condition, description,
// per-category attributes and a suggested price — so starting a listing is
// fast. It is a DRAFTING aid only: the wizard fills empty fields from it and
// never overwrites what the seller typed. When RAPIDAPI_KEY is configured the
// price suggestion is replaced by the median of real eBay sold comps for the
// item (see src/lib/ebay-sold.ts).

const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY;

// The category list, with each category's attribute keys and (for selects)
// the allowed values, so the model picks values the validators accept.
const CATEGORY_REFERENCE = CATEGORIES.map((c) => {
  const fields = c.attributes.map((f) => {
    if (f.type === "select") return `${f.key} (one of: ${f.options.join(" | ")})`;
    if (f.type === "number") {
      const range = [f.min != null ? `min ${f.min}` : "", f.max != null ? `max ${f.max}` : ""]
        .filter(Boolean)
        .join(", ");
      return `${f.key} (number${range ? `, ${range}` : ""})`;
    }
    return `${f.key} (free text)`;
  });
  return `- "${c.slug}" — ${c.name}: ${c.blurb}${
    fields.length ? `\n    attributes: ${fields.join("; ")}` : "\n    attributes: none"
  }`;
}).join("\n");

const CONDITION_REFERENCE = CONDITIONS.map(
  (c) => `"${c.value}" (${c.label}: ${c.hint})`,
).join(", ");

const SYSTEM_PROMPT = `You are a marketplace copywriter and product identifier for This'n'that, a general resale marketplace where people sell anything they own.
From the seller's photos, identify the item and produce a high-quality, honest listing.
Assess condition only from what is visible. Be honest and avoid hype. If you cannot identify the item confidently, say so in "notes" and still give your best guess.

Categories (pick exactly one slug; use "other" if nothing fits):
${CATEGORY_REFERENCE}

Conditions (pick exactly one value): ${CONDITION_REFERENCE}

Respond ONLY with a JSON object with these exact keys:
{
  "title": string,                 // compelling marketplace title, <= 80 chars, no ALL CAPS, no emoji
  "brand": string,                 // maker / label if identifiable, else ""
  "itemName": string,              // what the item is in a few words, e.g. "denim trucker jacket"
  "categorySlug": string,          // one of the category slugs above
  "condition": string,             // one of the condition values above
  "description": string,           // 2-4 honest sentences a buyer would want to read
  "attributes": object,            // { key: string } using ONLY that category's attribute keys; omit anything you can't tell from the photos
  "recommendedPrice": number,      // USD single suggested list price for a used-market sale
  "confidence": "high"|"medium"|"low",
  "notes": string                  // caveats, flaws you noticed, or ""
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
      {
        error:
          "Auto-fill isn't set up on this server (OPENAI_API_KEY missing). Fill in the details by hand.",
      },
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
    "Identify this item and write the listing." +
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
        max_tokens: 800,
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
  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json({ error: "No suggestion produced." }, { status: 502 });
  }

  // Coerce every field to something the sell form can actually store. The
  // model is told the vocabularies, but anything off-list is dropped rather
  // than passed through: a category that doesn't exist or a select value
  // outside its options would make the listing unsavable.
  const str = (v: unknown, n: number) =>
    typeof v === "string" ? v.trim().slice(0, n) : "";
  const title = str(parsed.title, 160);
  const brand = str(parsed.brand, 80);
  const itemName = str(parsed.itemName, 160);
  const description = str(parsed.description, 4000);
  const notes = str(parsed.notes, 500);
  const rawSlug = str(parsed.categorySlug, 60).toLowerCase();
  const categorySlug = isCategorySlug(rawSlug) ? rawSlug : "";
  const condition = canonicalCondition(parsed.condition);

  let attributes: Attributes = {};
  const category = getCategory(categorySlug);
  if (category) {
    // validateAttributes drops unknown keys; a single bad value (out-of-range
    // year, off-list option) would reject the whole map, so strip the offending
    // key and retry rather than losing every suggestion over one.
    const src =
      parsed.attributes && typeof parsed.attributes === "object" && !Array.isArray(parsed.attributes)
        ? { ...(parsed.attributes as Record<string, unknown>) }
        : {};
    for (const field of category.attributes) {
      const single = validateAttributes(category, { [field.key]: src[field.key] });
      if (single.ok && single.attributes[field.key]) {
        attributes[field.key] = single.attributes[field.key];
      }
    }
    const all = validateAttributes(category, attributes);
    attributes = all.ok ? all.attributes : {};
  }

  const priceNum = Number(parsed.recommendedPrice);
  let recommendedPrice: number | null =
    Number.isFinite(priceNum) && priceNum > 0 ? Math.round(priceNum * 100) / 100 : null;
  const confidenceRaw = str(parsed.confidence, 10).toLowerCase();
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
      ? confidenceRaw
      : "low";

  // Real eBay sold comps when configured, keyed by what the item is. A thin
  // sample (or no key) leaves the AI estimate in place.
  const compsQuery = `${brand} ${itemName || title}`.trim();
  const ebay = compsQuery ? await soldPriceSummary(compsQuery) : null;
  let priceSource: "ebay_sold_median" | "ai_estimate" = "ai_estimate";
  if (ebay) {
    recommendedPrice = ebay.median;
    priceSource = "ebay_sold_median";
  }

  return NextResponse.json({
    suggestion: {
      title,
      brand,
      itemName,
      categorySlug,
      condition,
      description,
      attributes,
      recommendedPrice,
      confidence,
      notes,
      priceSource,
    },
    ebayComps: ebay ? { median: ebay.median, count: ebay.count } : null,
  });
}
