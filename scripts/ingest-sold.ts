/**
 * Batch-ingest recent eBay sold listings into SoldItem, one beanie at a time.
 * Powers the /price-trends dashboard and the data-driven price guide. Idempotent
 * (deduped by eBay item id), so re-running refreshes and extends history.
 *
 * Requires RAPIDAPI_KEY (eBay "average selling price" API) and DATABASE_URL.
 *
 * Usage:
 *   npm run sold:ingest                              # original era, first 25
 *   npx tsx scripts/ingest-sold.ts --collection=all --limit=100 --offset=0
 *   npx tsx scripts/ingest-sold.ts --names="Peace,Princess,Erin"
 *   npx tsx scripts/ingest-sold.ts --delay=2000      # slower (rate limits)
 */
import { PrismaClient } from "@prisma/client";
import { BEANIES } from "../src/lib/beanie-database";
import { beaniePhotoKey } from "../src/lib/photos";
import { fetchCompletedItems } from "../src/lib/ebay-sold";

const DEFAULT_EXCLUDED =
  "lot bundle set case protector reprint fake counterfeit custom sticker";

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.RAPIDAPI_KEY) {
    console.error("RAPIDAPI_KEY is not set — subscribe to the eBay API and set it.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const collection = arg("collection", "original"); // original | expanded | all
  const limit = Number(arg("limit", "25"));
  const offset = Number(arg("offset", "0"));
  const delay = Number(arg("delay", "1200"));
  const namesArg = arg("names", "");

  let targets: { name: string }[];
  if (namesArg) {
    targets = namesArg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
  } else {
    targets = BEANIES.filter((b) => {
      const coll = b.collection ?? "original";
      return collection === "all" || coll === collection;
    })
      .map((b) => ({ name: b.name }))
      .slice(offset, offset + limit);
  }

  const prisma = new PrismaClient();
  let totalStored = 0;
  let done = 0;
  let failed = 0;

  console.log(
    `Ingesting ${targets.length} beanie(s) (${collection}, offset ${offset}), ` +
      `~${delay}ms apart…\n`,
  );

  try {
    for (const t of targets) {
      const key = beaniePhotoKey(t.name);
      if (!key) continue;
      try {
        const res = await fetchCompletedItems({
          keywords: `Ty Beanie Baby ${t.name}`.replace(/\s+/g, " ").trim(),
          excludedKeywords: DEFAULT_EXCLUDED,
          maxResults: 240,
          removeOutliers: true,
        });
        let stored = 0;
        for (const p of res.products) {
          if (!p.soldAt) continue;
          const fields = {
            normalizedKey: key,
            beanieName: t.name,
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
        totalStored += stored;
        done++;
        const med = res.medianCents != null ? `~$${Math.round(res.medianCents / 100)}` : "n/a";
        console.log(`✓ ${t.name}: ${stored} stored (API median ${med})`);
      } catch (e) {
        failed++;
        console.warn(`✗ ${t.name}: ${e instanceof Error ? e.message : e}`);
      }
      await sleep(delay);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `\nDone. ${done} ok · ${failed} failed · ${totalStored} sold rows upserted.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
