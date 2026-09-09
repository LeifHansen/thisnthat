/**
 * Seed Leif's 1990s Beanie inventory as placeholder listings.
 *
 * Creates a listing for every 1990s (1993–1999) catalogue entry in the
 * "common" (valueHigh ≤ $50) and "mid-tier" ($51–$400) tiers — the true
 * grails (> $400) are intentionally excluded. Each listing uses the BX logo
 * as a placeholder photo so real photos can be added later via the edit flow.
 *
 * Idempotent: skips any beanie the seller already has a listing for (by
 * normalized name), so it is safe to re-run. It NEVER deletes anything.
 *
 * Usage:
 *   npx tsx scripts/seed-inventory.ts            # creates ACTIVE listings
 *   SEED_STATUS=DRAFT npx tsx scripts/seed-inventory.ts
 *   SELLER_EMAIL=someone@x.com npx tsx scripts/seed-inventory.ts
 */
import { PrismaClient, type ListingStatus } from "@prisma/client";
import { BEANIES, type BeanieEntry } from "../src/lib/beanie-database";
import { PLACEHOLDER_PHOTO } from "../src/lib/photos";

const prisma = new PrismaClient();

const SELLER_EMAIL = process.env.SELLER_EMAIL ?? "admin@beaniexchange.com";
const STATUS: ListingStatus =
  process.env.SEED_STATUS === "DRAFT" ? "DRAFT" : "ACTIVE";

// Loose name key so "Snort" and "Snorts" (and punctuation/case variants) are
// treated as the same beanie when de-duplicating against existing listings.
function nameKey(s: string): string {
  return s
    .toLowerCase()
    .split("/")[0] // "Brownie / Cubbie" -> "brownie"
    .replace(/\(.*?\)/g, "") // drop parentheticals
    .replace(/[^a-z0-9]/g, "")
    .replace(/s$/, ""); // tolerate trailing plural
}

function midpointCents(low: number, high: number): number {
  return Math.max(5, Math.round((low + high) / 2)) * 100;
}

function describe(b: (typeof BEANIES)[number]): string {
  const animal = b.animal.toLowerCase();
  const lead = `A classic 1990s Ty Beanie Baby — ${b.name} the ${b.animal}` +
    (b.year ? ` (introduced ${b.year})` : "") +
    (b.styleNumber ? `, style #${b.styleNumber}` : "") +
    ".";
  const facts = [
    b.birthday ? `Ty birthday ${b.birthday}.` : "",
    b.note ? `${b.note}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  void animal;
  return (
    `${lead}${facts ? ` ${facts}` : ""}\n\n` +
    `From my personal 1990s collection. 📷 Placeholder image shown — real ` +
    `photos coming soon. Message me with any questions before you buy.`
  );
}

async function main() {
  const seller = await prisma.user.findUnique({
    where: { email: SELLER_EMAIL },
    select: { id: true, name: true, email: true },
  });
  if (!seller) {
    throw new Error(`Seller not found: ${SELLER_EMAIL}`);
  }

  // Existing listings for this seller — used to de-dupe.
  const existing = await prisma.listing.findMany({
    where: { sellerId: seller.id },
    select: { beanieName: true },
  });
  const existingKeys = new Set(existing.map((l) => nameKey(l.beanieName)));

  // Common + mid-tier 1990s beanies (exclude > $400 grails).
  const candidates = BEANIES.filter(
    (b): b is BeanieEntry & { valueLow: number; valueHigh: number } =>
      b.year != null &&
      b.year >= 1993 &&
      b.year <= 1999 &&
      b.valueLow != null &&
      b.valueHigh != null &&
      b.valueHigh <= 400,
  );

  const toCreate: {
    sellerId: string;
    title: string;
    beanieName: string;
    description: string;
    condition: string;
    year: number | null;
    priceCents: number;
    authType: "UNAUTHENTICATED";
    photos: string[];
    status: ListingStatus;
  }[] = [];

  const skipped: string[] = [];
  const seenThisRun = new Set<string>();

  for (const b of candidates) {
    const key = nameKey(b.name);
    if (existingKeys.has(key) || seenThisRun.has(key)) {
      skipped.push(b.name);
      continue;
    }
    seenThisRun.add(key);
    toCreate.push({
      sellerId: seller.id,
      title: b.name,
      beanieName: b.name,
      description: describe(b),
      condition: "Good vintage condition — full photos coming soon",
      year: b.year,
      priceCents: midpointCents(b.valueLow, b.valueHigh),
      authType: "UNAUTHENTICATED",
      photos: [PLACEHOLDER_PHOTO],
      status: STATUS,
    });
  }

  console.log(
    `Seller: ${seller.name} <${seller.email}>  status=${STATUS}\n` +
      `Candidates: ${candidates.length}  ToCreate: ${toCreate.length}  ` +
      `Skipped(existing/dupe): ${skipped.length}`,
  );
  if (skipped.length) console.log("Skipped:", skipped.join(", "));

  if (toCreate.length === 0) {
    console.log("Nothing to create — already seeded.");
    return;
  }

  if (process.env.DRY_RUN) {
    console.log("\n[DRY_RUN] Would create:");
    for (const l of toCreate) {
      console.log(`  ${l.title} (${l.year}) — $${(l.priceCents / 100).toFixed(0)}`);
    }
    console.log(`\n[DRY_RUN] ${toCreate.length} listings — no DB writes.`);
    return;
  }

  const result = await prisma.listing.createMany({ data: toCreate });
  console.log(`✓ Created ${result.count} listings.`);

  const total = await prisma.listing.count({ where: { sellerId: seller.id } });
  console.log(`Seller now has ${total} listings total.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
