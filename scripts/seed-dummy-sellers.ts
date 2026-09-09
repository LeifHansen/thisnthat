/**
 * Seed five dummy seller accounts and duplicate a handful of Leif's
 * photo-backed listings onto them, so the marketplace shows multiple active
 * sellers.
 *
 * - Copies reference the SAME photo URLs (R2/blob) as the source listing.
 * - Copies are always UNAUTHENTICATED with no cert/registry fields — auth
 *   badges and cert IDs must never be duplicated across listings.
 * - Prices are hand-varied off the source so copies don't look like clones.
 * - createdAt is back-dated per item so New Arrivals looks organic.
 *
 * Idempotent: users are upserted by email (existing passwords untouched);
 * a duplicate is skipped if the target account already has a listing with
 * the same title. NEVER deletes anything.
 *
 * Usage:
 *   npx tsx scripts/seed-dummy-sellers.ts
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

const SELLERS = [
  { email: "megan.r@beaniex.com", name: "Megan Rivera", joinedDaysAgo: 58 },
  { email: "tom.c@beaniex.com", name: "Tom Castillo", joinedDaysAgo: 49 },
  { email: "jenny.p@beaniex.com", name: "Jenny Park", joinedDaysAgo: 41 },
  { email: "dale.w@beaniex.com", name: "Dale Whitfield", joinedDaysAgo: 33 },
  { email: "priya.s@beaniex.com", name: "Priya Shah", joinedDaysAgo: 27 },
] as const;

// sourceId = existing listing to copy photos/title/details from.
// price = new price in whole dollars. listedDaysAgo back-dates the copy.
const DUPLICATES: {
  sourceId: string;
  sellerEmail: string;
  price: number;
  listedDaysAgo: number;
  description: string;
}[] = [
  {
    sourceId: "cmpsoa7cm0001n0ijv03818ur", // Princess $10
    sellerEmail: "megan.r@beaniex.com",
    price: 12,
    listedDaysAgo: 19,
    description:
      "Princess bear from my mom's collection — she kept it on a shelf since the late 90s. No hang tag, otherwise great shape. Smoke-free home, ships fast.",
  },
  {
    sourceId: "cmpsoo5ld0005n0ijhmxss0mv", // Ariel $150
    sellerEmail: "megan.r@beaniex.com",
    price: 139,
    listedDaysAgo: 12,
    description:
      "Ariel in mint condition. I've had her stored in a display case for years. Happy to send more photos if you want a closer look at the tags.",
  },
  {
    sourceId: "cmq19z06p000ao9os3ab2ero7", // Valentino $23
    sellerEmail: "megan.r@beaniex.com",
    price: 25,
    listedDaysAgo: 4,
    description:
      "Valentino bear, 1994. Tag protector on since day one. Make me an offer!",
  },
  {
    sourceId: "cmq19z06p0006o9osekd0mpcm", // Spot No Spot $154
    sellerEmail: "tom.c@beaniex.com",
    price: 165,
    listedDaysAgo: 16,
    description:
      "Spot the Dog — the no-spot version. Found while cleaning out my parents' attic and verified the style number myself. Selling to a good home, priced to what they've been going for.",
  },
  {
    sourceId: "cmq19z06p0003o9os7tkdtsxa", // Pinchers $18
    sellerEmail: "tom.c@beaniex.com",
    price: 15,
    listedDaysAgo: 8,
    description:
      "Pinchers the Lobster, 1993. Good vintage condition, some shelf wear on the tag. Ships in a box, not an envelope.",
  },
  {
    sourceId: "cmpsosyra0009n0ij7k3lsgwk", // Glory $100
    sellerEmail: "jenny.p@beaniex.com",
    price: 89,
    listedDaysAgo: 21,
    description:
      "Glory bear, mint. Was a gift in 1998 and has been in a curio cabinet ever since. Reasonable offers considered.",
  },
  {
    sourceId: "cmq19z06p0009o9osa07k35jq", // Peace $15
    sellerEmail: "jenny.p@beaniex.com",
    price: 17,
    listedDaysAgo: 10,
    description:
      "Peace bear with the classic tie-dye — every one is unique! This one has nice purple/teal swirls. Good condition.",
  },
  {
    sourceId: "cmq19z06p000do9oslr8pp4dz", // Erin $13
    sellerEmail: "jenny.p@beaniex.com",
    price: 12,
    listedDaysAgo: 2,
    description:
      "Erin the Irish bear, retired. Downsizing my collection — check my other listings, happy to combine shipping.",
  },
  {
    sourceId: "cmq19z06p0000o9oseum4bzgr", // Brownie / Cubbie $178
    sellerEmail: "dale.w@beaniex.com",
    price: 160,
    listedDaysAgo: 14,
    description:
      "Early Cubbie from 1993-94. I'm the original owner. Some wear consistent with age, see photos. Serious buyers only please.",
  },
  {
    sourceId: "cmq19z06s004qo9osz8mokm0m", // Bucky $13
    sellerEmail: "dale.w@beaniex.com",
    price: 14,
    listedDaysAgo: 6,
    description:
      "Bucky the Beaver, 1997, style 4016. Clean and from a pet-free home.",
  },
  {
    sourceId: "cmq19z06p000fo9ospwixi8em", // Maple $48
    sellerEmail: "priya.s@beaniex.com",
    price: 42,
    listedDaysAgo: 17,
    description:
      "Maple — the Canada exclusive! Picked this up on a trip to Toronto in the 90s. Hard to find in the US. Good vintage condition.",
  },
  {
    sourceId: "cmq19z06p000eo9oscaaieuop", // Halo $15
    sellerEmail: "priya.s@beaniex.com",
    price: 18,
    listedDaysAgo: 9,
    description:
      "Halo the angel bear with the iridescent wings. Stored in a smoke-free home since 1998. Bundle with my other listings and save on shipping.",
  },
  {
    sourceId: "cmq19z06p000co9osgbbmwwe5", // Curly $13
    sellerEmail: "priya.s@beaniex.com",
    price: 11,
    listedDaysAgo: 1,
    description:
      "Curly the brown napped bear, retired 1996 style. Priced to sell this week.",
  },
];

// Drop seed-script boilerplate like "— full photos coming soon" from the
// condition string; the copies have real photos.
function cleanCondition(c: string): string {
  return c.split("—")[0].trim() || "Good vintage condition";
}

async function main() {
  const printable: string[] = [];

  const userIdByEmail = new Map<string, string>();
  for (const s of SELLERS) {
    const existing = await prisma.user.findUnique({
      where: { email: s.email },
    });
    if (existing) {
      userIdByEmail.set(s.email, existing.id);
      printable.push(`${s.email} — already existed, password unchanged`);
      continue;
    }
    const password = randomBytes(9).toString("base64url");
    const user = await prisma.user.create({
      data: {
        email: s.email,
        name: s.name,
        passwordHash: await bcrypt.hash(password, 10),
        role: "USER",
        createdAt: daysAgo(s.joinedDaysAgo),
      },
    });
    userIdByEmail.set(s.email, user.id);
    printable.push(`${s.email} — created, password: ${password}`);
  }

  let created = 0;
  let skipped = 0;
  for (const d of DUPLICATES) {
    const source = await prisma.listing.findUnique({
      where: { id: d.sourceId },
    });
    if (!source) {
      console.warn(`! source listing ${d.sourceId} not found — skipped`);
      skipped++;
      continue;
    }
    const sellerId = userIdByEmail.get(d.sellerEmail)!;
    const already = await prisma.listing.findFirst({
      where: { sellerId, title: source.title },
    });
    if (already) {
      skipped++;
      continue;
    }
    await prisma.listing.create({
      data: {
        sellerId,
        title: source.title,
        beanieName: source.beanieName,
        year: source.year,
        condition: cleanCondition(source.condition),
        description: d.description,
        priceCents: d.price * 100,
        photos: source.photos.filter((p) => p !== "/bx-logo.png"),
        authType: "UNAUTHENTICATED",
        status: "ACTIVE",
        createdAt: daysAgo(d.listedDaysAgo),
      },
    });
    created++;
    console.log(
      `+ "${source.title}" -> ${d.sellerEmail} at $${d.price} (listed ${d.listedDaysAgo}d ago)`,
    );
  }

  console.log(`\nListings: ${created} created, ${skipped} skipped (already present).`);
  console.log(`\nAccounts:`);
  for (const line of printable) console.log(`  ${line}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
