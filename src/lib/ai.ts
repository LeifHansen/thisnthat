// AI listing assistant.
//
// Given the seller's photos, ask Google Gemini (vision) to identify the item
// and pre-fill the listing form: title, category, brand, condition, size,
// description, and a suggested price. Google Lens-style scanning.
//
// Uses the Gemini REST API directly (no SDK). When GEMINI_API_KEY is not set
// it returns a clearly-labelled sample suggestion so the photo-first workflow
// is fully demonstrable before the key is configured.

import type { CategorySlug } from "./types";

export interface ListingSuggestion {
  title: string;
  category_slug: CategorySlug;
  brand: string | null;
  size: string | null;
  condition: string;
  description: string;
  suggested_price_cents: number;
  // "ai" when Gemini produced this, "sample" for the no-key fallback.
  source: "ai" | "sample";
}

export interface InputImage {
  base64: string; // raw base64, no data: prefix
  mimeType: string;
}

const CATEGORIES: CategorySlug[] = [
  "clothing",
  "shoes",
  "accessories",
  "memorabilia",
  "collectables",
];

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

const PROMPT = `You are a listing assistant for a resale marketplace that sells
vintage clothing, shoes, accessories, sports memorabilia, and collectables.
Look at the photo(s) of a single item a seller wants to list and return ONLY a
JSON object (no markdown) with these fields:
- "title": a concise, appealing listing title (max ~70 chars)
- "category_slug": one of ${CATEGORIES.map((c) => `"${c}"`).join(", ")}
- "brand": the brand if identifiable, else null
- "size": the size if visible/inferable, else null
- "condition": one of "New", "Like New", "Good", "Worn"
- "description": 1-3 sentences a buyer would find helpful
- "suggested_price_cents": a fair resale price in US cents (integer)`;

export async function analyzeListingPhotos(
  images: InputImage[],
): Promise<ListingSuggestion> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
  if (!apiKey || images.length === 0) {
    return sampleSuggestion();
  }

  try {
    const body = {
      contents: [
        {
          parts: [
            { text: PROMPT },
            ...images.slice(0, 4).map((img) => ({
              inline_data: { mime_type: img.mimeType, data: img.base64 },
            })),
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}`);

    const json = await res.json();
    const text: string =
      json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
    const parsed = JSON.parse(text);
    return normalize(parsed, "ai");
  } catch (err) {
    console.error("Gemini analysis failed, using sample:", err);
    return sampleSuggestion();
  }
}

function normalize(raw: Record<string, unknown>, source: "ai" | "sample"): ListingSuggestion {
  const category = CATEGORIES.includes(raw.category_slug as CategorySlug)
    ? (raw.category_slug as CategorySlug)
    : "collectables";
  const conditions = ["New", "Like New", "Good", "Worn"];
  const condition = conditions.includes(String(raw.condition)) ? String(raw.condition) : "Good";
  const price = Number(raw.suggested_price_cents);
  return {
    title: String(raw.title ?? "Vintage find").slice(0, 80),
    category_slug: category,
    brand: raw.brand ? String(raw.brand) : null,
    size: raw.size ? String(raw.size) : null,
    condition,
    description: String(raw.description ?? ""),
    suggested_price_cents: Number.isFinite(price) && price > 0 ? Math.round(price) : 2500,
    source,
  };
}

function sampleSuggestion(): ListingSuggestion {
  return normalize(
    {
      title: "Vintage find — add your details",
      category_slug: "collectables",
      brand: null,
      size: null,
      condition: "Good",
      description:
        "Auto-fill sample: connect a Gemini API key (GEMINI_API_KEY) to scan photos and pre-fill this from the image.",
      suggested_price_cents: 2500,
    },
    "sample",
  );
}
