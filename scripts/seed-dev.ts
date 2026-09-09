/**
 * Local dev seed — populate the marketplace with MULTIPLE active listings per
 * beanie, from different sellers at varied prices, so price ranges, the
 * "Shop Options" flow, and the options carousel have realistic data to show.
 *
 * Placeholder photos only (real seller photos live in R2, not available in a
 * fresh dev DB). Safe to re-run: it skips beanies that already have listings.
 *
 * Usage:  npx tsx scripts/seed-dev.ts
 */
import { PrismaClient, type AuthType, type ListingStatus } from "@prisma/client";
import { BEANIES, type BeanieEntry } from "../src/lib/beanie-database";
import { PLACEHOLDER_PHOTO } from "../src/lib/photos";

const prisma = new PrismaClient();

const SELLER_EMAILS = [
  "admin@beaniex.com",
  "seller@beaniex.com",
  "megan.r@beaniex.com",
  "tom.c@beaniex.com",
  "jenny.p@beaniex.com",
  "dale.w@beaniex.com",
  "priya.s@beaniex.com",
];

const CONDITIONS = [
  "Mint with mint tag (MWMT)",
  "Excellent — tag protector on since day one",
  "Very good — light shelf wear on the tag",
  "Good vintage condition, smoke-free home",
  "Good — some fading, see photos",
];

// Mostly sold as-is; a minority carry a verification for badge variety.
const AUTH_WEIGHTS: { type: AuthType; weight: number }[] = [
  { type: "UNAUTHENTICATED", weight: 70 },
  { type: "TRUE_BLUE", weight: 12 },
  { type: "THIRD_PARTY_COA", weight: 10 },
  { type: "BX_FULL_SERVICE", weight: 8 },
];

const DAY = 24 * 60 * 60 * 1000;
const randInt = (lo: number, hi: number) =>
  Math.floor(Math.random() * (hi - lo + 1)) + lo;
const pick = <T>(arr: readonly T[]) => arr[randInt(0, arr.length - 1)];

function pickAuth(): AuthType {
  const total = AUTH_WEIGHTS.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const a of AUTH_WEIGHTS) {
    if ((r -= a.weight) <= 0) return a.type;
  }
  return "UNAUTHENTICATED";
}

// Weighted number of competing options per beanie (1–4).
function numOptions(): number {
  const r = Math.random();
  if (r < 0.4) return 1;
  if (r < 0.7) return 2;
  if (r < 0.9) return 3;
  return 4;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const sellers = await prisma.user.findMany({
    where: { email: { in: SELLER_EMAILS } },
    select: { id: true, email: true },
  });
  if (sellers.length === 0) {
    throw new Error(
      "No seller accounts found. Run prisma/seed.ts and seed-dummy-sellers.ts first.",
    );
  }
  const sellerIds = sellers.map((s) => s.id);

  const existing = new Set(
    (
      await prisma.listing.findMany({ select: { beanieName: true } })
    ).map((l) => l.beanieName),
  );

  // 1990s common + mid-tier beanies (skip > $400 grails for sane prices).
  const candidates = BEANIES.filter(
    (b): b is BeanieEntry & { valueLow: number; valueHigh: number } =>
      Boolean(b.year && b.year >= 1993 && b.year <= 1999) &&
      b.valueLow != null &&
      b.valueHigh != null &&
      b.valueHigh <= 400,
  );

  const data: {
    sellerId: string;
    title: string;
    beanieName: string;
    description: string;
    condition: string;
    year: number | null;
    priceCents: number;
    authType: AuthType;
    photos: string[];
    status: ListingStatus;
    createdAt: Date;
  }[] = [];

  for (const b of candidates) {
    if (existing.has(b.name)) continue;
    const n = Math.min(numOptions(), sellerIds.length);
    const chosen = shuffle(sellerIds).slice(0, n);
    for (const sellerId of chosen) {
      // Price somewhere in the beanie's value band, jittered ±15%.
      const base = randInt(b.valueLow, Math.max(b.valueLow, b.valueHigh));
      const jittered = Math.max(5, Math.round(base * (0.85 + Math.random() * 0.3)));
      data.push({
        sellerId,
        title: `${b.name}${b.year ? ` (${b.year})` : ""} — ${b.animal}`,
        beanieName: b.name,
        description:
          `${b.name} the ${b.animal}${b.year ? `, introduced ${b.year}` : ""}.` +
          `${b.note ? ` ${b.note}` : ""} From my personal 1990s collection. ` +
          `Placeholder image shown for now — message me for real photos.`,
        condition: pick(CONDITIONS),
        year: b.year,
        priceCents: jittered * 100,
        authType: pickAuth(),
        photos: [PLACEHOLDER_PHOTO],
        status: "ACTIVE",
        createdAt: new Date(Date.now() - randInt(0, 60) * DAY),
      });
    }
  }

  if (data.length === 0) {
    console.log("Nothing to seed — listings already present.");
    return;
  }

  const result = await prisma.listing.createMany({ data });
  const beanies = new Set(data.map((d) => d.beanieName)).size;
  console.log(
    `✓ Created ${result.count} listings across ${beanies} beanies ` +
      `(${sellers.length} sellers). Many beanies now have multiple priced options.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
