import { prisma } from "@/lib/db";
import { beaniePhotoKey } from "@/lib/photos";
import { resolveBeanie } from "@/lib/beanie-id";
import { fetchCompletedItems } from "@/lib/ebay-sold";

// Ingest recent eBay sold listings for a beanie into SoldItem. Idempotent:
// deduped by eBay item id, so re-running just refreshes / extends the history.

// Exclude noise that skews a single beanie's price: multi-item lots, accessories
// (cases, tag protectors), and obvious fakes/reprints.
const DEFAULT_EXCLUDED =
  "lot bundle set case protector reprint fake counterfeit custom sticker";

/** Search phrase for a beanie — the brand + name matches most seller titles. */
export function buildKeywords(name: string): string {
  return `Ty Beanie Baby ${name}`.replace(/\s+/g, " ").trim();
}

export type IngestResult = {
  key: string;
  name: string;
  /** Priced products the API returned. */
  fetched: number;
  /** Rows upserted (those with a parseable sold date). */
  stored: number;
  /** The API's own median for the search, in cents (sanity reference). */
  apiMedianCents: number | null;
};

export async function ingestBeanie(rawName: string): Promise<IngestResult> {
  const entry = resolveBeanie(rawName);
  const name = entry?.name ?? rawName.trim();
  const key = beaniePhotoKey(name);
  if (!key) throw new Error("Empty beanie name.");

  const res = await fetchCompletedItems({
    keywords: buildKeywords(name),
    excludedKeywords: DEFAULT_EXCLUDED,
    maxResults: 240,
    removeOutliers: true,
  });

  let stored = 0;
  for (const p of res.products) {
    if (!p.soldAt) continue; // a sold date is required for trends
    const fields = {
      normalizedKey: key,
      beanieName: name,
      title: p.title,
      priceCents: p.saleCents,
      shippingCents: p.shippingCents,
      currency: p.currency,
      condition: p.condition,
      buyingFormat: p.buyingFormat,
      soldAt: p.soldAt,
      link: p.link,
      imageUrl: p.imageUrl,
    };
    await prisma.soldItem.upsert({
      where: { itemId: p.itemId },
      update: fields,
      create: { itemId: p.itemId, ...fields },
    });
    stored++;
  }

  return { key, name, fetched: res.products.length, stored, apiMedianCents: res.medianCents };
}
