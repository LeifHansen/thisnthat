// Database seed. Run with `npm run db:seed` (tsx) — also invoked by
// `prisma db seed` from the Fly release command, so everything here must be
// idempotent and must never touch data that belongs to a real user.
//
//   1. Upsert every category from src/lib/categories.ts (all environments).
//   2. Upsert the three demo accounts (all environments).
//   3. Reset demo data: rows owned by the demo accounts from earlier runs.
//   4. Outside production only: upsert a spread of demo listings so a fresh
//      dev database has something to browse, offer on and check out.
//
// This file cannot import src/lib/categoryStore.ts (it is "server-only"), so
// the category upsert re-implements the same `rowFromDef` row shape here.

import { PrismaClient, type Condition } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import {
  CATEGORIES,
  getCategory,
  validateAttributes,
  type CategoryDef,
} from "../src/lib/categories";
import { PLACEHOLDER_PHOTO } from "../src/lib/photos";

const prisma = new PrismaClient();

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const DEMO_ADMIN_EMAIL = "admin@thisnthat.com";
const DEMO_SELLER_EMAIL = "seller@thisnthat.com";
const DEMO_BUYER_EMAIL = "buyer@thisnthat.com";

// --- 1. Categories -----------------------------------------------------------

/** Column values for a Category row — mirrors rowFromDef in categoryStore.ts. */
function rowFromDef(def: CategoryDef, position: number) {
  return {
    slug: def.slug,
    name: def.name,
    position,
    attributeSchema: def.attributes.map((f) => ({ ...f })),
  };
}

async function syncCategories(): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  for (const [i, def] of CATEGORIES.entries()) {
    const row = rowFromDef(def, i);
    const saved = await prisma.category.upsert({
      where: { slug: def.slug },
      update: {
        name: row.name,
        position: row.position,
        attributeSchema: row.attributeSchema,
      },
      create: row,
      select: { id: true },
    });
    idBySlug.set(def.slug, saved.id);
  }
  return idBySlug;
}

// --- 2. Demo accounts --------------------------------------------------------

async function demoPasswordHash(): Promise<{ hash: string; shown: string }> {
  // In local/dev the demo password is the well-known "password123". In
  // production we never ship a guessable password: SEED_DEMO_PASSWORD if
  // provided, otherwise a throwaway random one (the accounts still exist so
  // demo-owned rows keep their FK integrity, but nobody can sign in to them
  // with a known credential).
  const explicit = process.env.SEED_DEMO_PASSWORD;
  const password =
    explicit ?? (IS_PRODUCTION ? randomBytes(24).toString("hex") : "password123");
  const shown = explicit
    ? "(SEED_DEMO_PASSWORD)"
    : IS_PRODUCTION
      ? "(random, not recoverable)"
      : password;
  return { hash: await bcrypt.hash(password, 10), shown };
}

async function upsertDemoUsers(passwordHash: string) {
  const admin = await prisma.user.upsert({
    where: { email: DEMO_ADMIN_EMAIL },
    update: {},
    create: {
      email: DEMO_ADMIN_EMAIL,
      name: "Site Admin",
      displayName: "This'n'that Admin",
      passwordHash,
      role: "ADMIN",
      addressLine1: "100 Main Street",
      addressLine2: "Suite 200",
      city: "Seattle",
      state: "WA",
      postalCode: "98101",
      country: "US",
      shipFromPostalCode: "98101",
    },
  });

  const seller = await prisma.user.upsert({
    where: { email: DEMO_SELLER_EMAIL },
    // The demo seller must always be able to rate shipping, even if an
    // earlier run created the row without a ship-from ZIP.
    update: { shipFromPostalCode: "97201" },
    create: {
      email: DEMO_SELLER_EMAIL,
      name: "Sam Seller",
      displayName: "Sam's Closet",
      bio: "Clearing out a lifetime of finds — denim, records, odd little objects. Everything ships within two days.",
      passwordHash,
      role: "USER",
      addressLine1: "42 Elm Avenue",
      city: "Portland",
      state: "OR",
      postalCode: "97201",
      country: "US",
      shipFromPostalCode: "97201",
    },
  });

  const buyer = await prisma.user.upsert({
    where: { email: DEMO_BUYER_EMAIL },
    update: {},
    create: {
      email: DEMO_BUYER_EMAIL,
      name: "Blake Buyer",
      passwordHash,
      role: "USER",
      addressLine1: "7 Harbor Court",
      city: "San Diego",
      state: "CA",
      postalCode: "92101",
      country: "US",
    },
  });

  return { admin, seller, buyer };
}

// --- 3. Reset demo data ------------------------------------------------------

/**
 * Remove rows created by (or on) the demo accounts in earlier runs so a
 * re-seed starts from a known state: orders, offers, reviews, messages, likes
 * and follows where a demo account is a party, plus any demo-owned listing
 * that is not in the current demo set. Real users' rows are never touched —
 * every delete is scoped by demo user id or demo listing id.
 */
async function resetDemoData(demoUserIds: string[], keepListingIds: string[]) {
  const demoListingIds = (
    await prisma.listing.findMany({
      where: { sellerId: { in: demoUserIds } },
      select: { id: true },
    })
  ).map((l) => l.id);

  const orderScope = {
    OR: [
      { sellerId: { in: demoUserIds } },
      { buyerId: { in: demoUserIds } },
      { listingId: { in: demoListingIds } },
    ],
  };

  const reviews = await prisma.productReview.deleteMany({
    where: {
      OR: [
        { buyerId: { in: demoUserIds } },
        { sellerId: { in: demoUserIds } },
        { listingId: { in: demoListingIds } },
      ],
    },
  });
  const shipmentEvents = await prisma.shipmentEvent.deleteMany({
    where: { order: orderScope },
  });
  const offers = await prisma.offer.deleteMany({
    where: {
      OR: [
        { buyerId: { in: demoUserIds } },
        { listingId: { in: demoListingIds } },
      ],
    },
  });
  const orders = await prisma.order.deleteMany({ where: orderScope });
  const messages = await prisma.message.deleteMany({
    where: {
      OR: [
        { senderId: { in: demoUserIds } },
        {
          conversation: {
            OR: [
              { userAId: { in: demoUserIds } },
              { userBId: { in: demoUserIds } },
            ],
          },
        },
      ],
    },
  });
  const conversations = await prisma.conversation.deleteMany({
    where: {
      OR: [{ userAId: { in: demoUserIds } }, { userBId: { in: demoUserIds } }],
    },
  });
  const likes = await prisma.listingLike.deleteMany({
    where: {
      OR: [
        { userId: { in: demoUserIds } },
        { listingId: { in: demoListingIds } },
      ],
    },
  });
  const follows = await prisma.follow.deleteMany({
    where: {
      OR: [
        { followerId: { in: demoUserIds } },
        { followedId: { in: demoUserIds } },
      ],
    },
  });
  // Stale demo listings (from an older seed, or ones a dev made while signed
  // in as a demo account). LotItem cascades with the listing.
  const listings = await prisma.listing.deleteMany({
    where: {
      sellerId: { in: demoUserIds },
      id: { notIn: keepListingIds },
    },
  });

  return {
    reviews: reviews.count,
    shipmentEvents: shipmentEvents.count,
    offers: offers.count,
    orders: orders.count,
    messages: messages.count,
    conversations: conversations.count,
    likes: likes.count,
    follows: follows.count,
    staleListings: listings.count,
  };
}

// --- 4. Demo listings (non-production only) ---------------------------------

type DemoListing = {
  /** Stable id so re-seeding updates in place instead of churning rows. */
  id: string;
  owner: "seller" | "admin";
  category: string;
  title: string;
  brand?: string;
  itemName?: string;
  description: string;
  attributes: Record<string, string>;
  condition: Condition;
  priceCents: number;
  quantity?: number;
  minAutoAcceptCents?: number;
  lotItems?: { name: string; quantity?: number }[];
};

const DEMO_LISTINGS: DemoListing[] = [
  {
    id: "demo_vintage_denim_jacket",
    owner: "seller",
    category: "apparel",
    title: "Vintage Levi's Type III trucker jacket, 1990s",
    brand: "Levi's",
    itemName: "denim jacket",
    description:
      "Classic 70506 trucker in a faded medium indigo with honest wear at the cuffs and collar. Made in USA tag, all buttons original, no rips or repairs. Fits like a modern large — measurements below.",
    attributes: {
      department: "Men",
      size: "L",
      colour: "Indigo",
      era: "1990s",
      material: "100% cotton denim",
      measurements: 'Pit to pit 23", length 25", sleeve 25"',
    },
    condition: "GOOD",
    priceCents: 6800,
    minAutoAcceptCents: 6000,
  },
  {
    id: "demo_running_shoes",
    owner: "seller",
    category: "shoes",
    title: "Nike Pegasus 40 running shoes — new in box",
    brand: "Nike",
    itemName: "running shoes",
    description:
      "Bought for a race I never ran. Still in the original box with tissue, never laced up. White with coral swoosh.",
    attributes: {
      department: "Women",
      size: "8.5",
      colour: "White / coral",
      style: "Sneakers",
      box: "Yes",
    },
    condition: "NEW",
    priceCents: 7500,
  },
  {
    id: "demo_leather_tote",
    owner: "seller",
    category: "accessories",
    title: "Madewell Transport tote in English saddle leather",
    brand: "Madewell",
    itemName: "leather tote",
    description:
      "The full-size Transport tote, broken in beautifully — the leather has darkened to a warm tan. Interior is clean, straps are solid, one faint pen mark inside the pocket.",
    attributes: {
      type: "Bag",
      colour: "Tan",
      material: "Full-grain leather",
      era: "2010s",
    },
    condition: "GOOD",
    priceCents: 9500,
  },
  {
    id: "demo_plush_bunny",
    owner: "seller",
    category: "collectibles-plush",
    title: "Jellycat Bashful bunny, medium, cream",
    brand: "Jellycat",
    itemName: "plush bunny",
    description:
      "Medium Bashful bunny in cream. Displayed on a shelf, never slept with, fur still soft and unmatted. Tush tag intact, no hang tag.",
    attributes: {
      type: "Plush",
      series: "Jellycat Bashful",
      year: "2019",
      packaging: "Loose",
    },
    condition: "LIKE_NEW",
    priceCents: 2200,
    quantity: 2,
  },
  {
    id: "demo_pokemon_blastoise",
    owner: "seller",
    category: "trading-cards",
    title: "Blastoise holo 2/102 — Base Set Unlimited, ungraded",
    brand: "Pokémon",
    itemName: "trading card",
    description:
      "Unlimited Base Set Blastoise holo. Light edge wear on the back, front surface is clean with minor holo scratching under direct light. Never graded — photos show every corner. Ships in a sleeve and toploader.",
    attributes: {
      game: "Pokémon",
      set: "Base Set",
      cardNumber: "2/102",
      year: "1999",
      grade: "Ungraded",
    },
    condition: "GOOD",
    priceCents: 14500,
    minAutoAcceptCents: 12500,
  },
  {
    id: "demo_framed_print",
    owner: "seller",
    category: "art-prints",
    title: "Framed 1978 botanical exhibition poster",
    itemName: "framed print",
    description:
      "Offset litho exhibition poster in a simple black wood frame with glass. Paper has toned slightly and evenly; no tears or foxing. Ready to hang.",
    attributes: {
      medium: "Poster",
      artist: "Unknown",
      year: "1978",
      dimensions: "18 × 24 in (framed 20 × 26 in)",
      signed: "No",
      framed: "Yes",
    },
    condition: "GOOD",
    priceCents: 8500,
  },
  {
    id: "demo_ceramic_vase",
    owner: "seller",
    category: "pottery-glass",
    title: "Studio stoneware vase with speckled oatmeal glaze",
    itemName: "ceramic vase",
    description:
      "Wheel-thrown stoneware bud vase, about 8 inches tall, with a speckled oatmeal glaze that pools darker at the neck. Impressed maker's mark on the base I can't identify. No chips or cracks.",
    attributes: {
      material: "Stoneware",
      maker: "Unknown studio potter",
      pattern: "Speckled oatmeal glaze",
      year: "1970",
      marked: "Yes",
    },
    condition: "GOOD",
    priceCents: 4800,
  },
  {
    id: "demo_brass_lamp",
    owner: "seller",
    category: "home-decor",
    title: "1970s brass table lamp with pleated shade",
    itemName: "table lamp",
    description:
      "Heavy solid-brass column lamp with its original pleated shade. Works, but the cord is old and should be rewired before daily use; some tarnish and a small dent near the base — priced accordingly.",
    attributes: {
      type: "Lighting",
      material: "Brass",
      colour: "Antique gold",
      era: "1970s",
      dimensions: "22 in tall, 12 in shade",
    },
    condition: "FAIR",
    priceCents: 7500,
  },
  {
    id: "demo_game_boy_color",
    owner: "seller",
    category: "electronics",
    title: "Nintendo Game Boy Color, teal, with Tetris DX",
    brand: "Nintendo",
    itemName: "Game Boy Color",
    description:
      "Teal Game Boy Color, fully working — screen has no lines, all buttons responsive, battery cover present. Shell has light scuffs. Comes with a Tetris DX cartridge (loose).",
    attributes: {
      type: "Handheld",
      model: "Game Boy Color",
      year: "1998",
      working: "Fully working",
      includes: "Tetris DX cartridge",
    },
    condition: "GOOD",
    priceCents: 9500,
  },
  {
    id: "demo_vinyl_rumours",
    owner: "seller",
    category: "books-media",
    title: "Fleetwood Mac — Rumours, 1977 Warner Bros. LP",
    brand: "Warner Bros.",
    itemName: "vinyl record",
    description:
      "Original 1977 US pressing. Vinyl plays clean with light surface noise between tracks; sleeve has ring wear and a small split at the bottom seam. Original inner sleeve and insert included.",
    attributes: {
      format: "Vinyl",
      creator: "Fleetwood Mac",
      year: "1977",
      edition: "1977 Warner Bros. US pressing",
    },
    condition: "GOOD",
    priceCents: 2800,
  },
  {
    id: "demo_board_game_catan",
    owner: "seller",
    category: "toys-games",
    title: "Catan (5th edition) — complete, played twice",
    brand: "Catan Studio",
    itemName: "board game",
    description:
      "All tiles, roads, settlements, cities, cards and dice present and counted. Box has a little shelf wear on one corner. Rules booklet included.",
    attributes: {
      type: "Board game",
      year: "2015",
      ages: "10+",
      completeness: "Complete",
    },
    condition: "LIKE_NEW",
    priceCents: 3500,
  },
  {
    id: "demo_vintage_buttons",
    owner: "seller",
    category: "other",
    title: "Tin of assorted vintage buttons (about 300)",
    itemName: "vintage buttons",
    description:
      "A grandmother's button tin: bakelite, mother-of-pearl, metal shank buttons and plenty of plain ones. Unsorted, sold as a lot for crafters. The tin itself is dented but charming.",
    attributes: {},
    condition: "FAIR",
    priceCents: 1500,
  },
  {
    id: "demo_polaroid_sx70",
    owner: "seller",
    category: "electronics",
    title: "Polaroid SX-70 Land Camera — for parts or repair",
    brand: "Polaroid",
    itemName: "instant camera",
    description:
      "Chrome and tan SX-70. The bellows are intact and the body folds correctly, but the shutter does not fire. Sold strictly for parts or repair; no returns on function.",
    attributes: {
      type: "Camera",
      model: "SX-70",
      year: "1975",
      working: "Not working / for parts",
      includes: "Camera body only",
    },
    condition: "FOR_PARTS",
    priceCents: 4000,
  },
  {
    id: "demo_lot_band_tees",
    owner: "seller",
    category: "apparel",
    title: "Lot of 5 vintage band tees (sizes M–L)",
    itemName: "band t-shirts",
    description:
      "Five 1990s band tees sold together. All single-stitch except the Weezer. Mixed sizes; measurements for each in the photos. Some fading and cracking to prints, no holes.",
    attributes: {
      department: "Unisex",
      size: "Other (see description)",
      era: "1990s",
      material: "100% cotton",
    },
    condition: "GOOD",
    priceCents: 11000,
    lotItems: [
      { name: "Nirvana In Utero tee, L" },
      { name: "Pearl Jam Vs. tour tee, M" },
      { name: "Smashing Pumpkins Siamese Dream tee, L" },
      { name: "Weezer blue album tee, M" },
      { name: "Soundgarden Superunknown tee, L" },
    ],
  },
  {
    id: "demo_lot_pokemon_holos",
    owner: "seller",
    category: "trading-cards",
    title: "Bundle of 12 Pokémon holo cards, 1999–2001",
    brand: "Pokémon",
    itemName: "trading cards",
    description:
      "Twelve holo cards from Base Set through Neo Genesis, all played condition with whitening and light scratches. No Charizard — this is a fun starter bundle, not an investment.",
    attributes: {
      game: "Pokémon",
      grade: "Ungraded",
    },
    condition: "FAIR",
    priceCents: 6000,
    lotItems: [
      { name: "Base Set holos (Unlimited)", quantity: 5 },
      { name: "Jungle holos", quantity: 3 },
      { name: "Fossil holos", quantity: 2 },
      { name: "Neo Genesis holos", quantity: 2 },
    ],
  },
  {
    id: "demo_teak_side_table",
    owner: "admin",
    category: "home-decor",
    title: "Mid-century Danish teak side table",
    itemName: "side table",
    description:
      "Small teak side table with tapered legs and a single drawer, Danish-made and marked underneath. Refinished with oil; one light ring on the top that mostly disappears with wax. Local pickup preferred but will ship.",
    attributes: {
      type: "Furniture",
      material: "Teak",
      colour: "Warm brown",
      era: "1960s",
      dimensions: "20 × 16 × 22 in",
    },
    condition: "GOOD",
    priceCents: 14000,
  },
  {
    id: "demo_first_edition_hardcover",
    owner: "admin",
    category: "books-media",
    title: "The Left Hand of Darkness — 1969 Ace hardcover",
    itemName: "hardcover book",
    description:
      "Early hardcover printing in its dust jacket. Jacket has a closed tear at the spine head and sunning to the spine; boards are clean, binding tight, no writing inside.",
    attributes: {
      format: "Hardcover",
      creator: "Ursula K. Le Guin",
      year: "1969",
      edition: "Early hardcover printing, in jacket",
    },
    condition: "GOOD",
    priceCents: 22000,
  },
];

async function upsertDemoListings(
  users: { seller: { id: string }; admin: { id: string } },
  categoryIdBySlug: Map<string, string>,
): Promise<{ listings: number; lots: number }> {
  let listings = 0;
  let lots = 0;
  for (const demo of DEMO_LISTINGS) {
    const def = getCategory(demo.category);
    if (!def) throw new Error(`seed: unknown category ${demo.category}`);
    const categoryId = categoryIdBySlug.get(demo.category);
    if (!categoryId) throw new Error(`seed: category ${demo.category} not synced`);

    // Every demo attribute set must pass the same validation a seller's form
    // goes through — a stale key or option here would otherwise ship invalid
    // rows into every dev database.
    const checked = validateAttributes(def, demo.attributes);
    if (!checked.ok) {
      throw new Error(`seed: ${demo.id}: ${checked.error}`);
    }

    const sellerId = demo.owner === "admin" ? users.admin.id : users.seller.id;
    const isLot = !!demo.lotItems?.length;
    const data = {
      sellerId,
      title: demo.title,
      description: demo.description,
      categoryId,
      brand: demo.brand ?? null,
      itemName: demo.itemName ?? null,
      attributes: checked.attributes,
      condition: demo.condition,
      priceCents: demo.priceCents,
      quantity: demo.quantity ?? 1,
      isLot,
      photos: [PLACEHOLDER_PHOTO],
      minAutoAcceptCents: demo.minAutoAcceptCents ?? null,
      status: "ACTIVE" as const,
    };

    await prisma.listing.upsert({
      where: { id: demo.id },
      update: data,
      create: { id: demo.id, ...data },
    });

    // Lot contents are replaced wholesale so edits to the list above land.
    await prisma.lotItem.deleteMany({ where: { listingId: demo.id } });
    if (isLot && demo.lotItems) {
      await prisma.lotItem.createMany({
        data: demo.lotItems.map((item, position) => ({
          listingId: demo.id,
          name: item.name,
          quantity: item.quantity ?? 1,
          position,
        })),
      });
      lots++;
    }
    listings++;
  }
  return { listings, lots };
}

// --- main --------------------------------------------------------------------

async function main() {
  const categoryIdBySlug = await syncCategories();
  console.log(`Categories synced: ${categoryIdBySlug.size}`);

  const { hash, shown } = await demoPasswordHash();
  const users = await upsertDemoUsers(hash);
  console.log("Demo accounts:", {
    admin: users.admin.email,
    seller: users.seller.email,
    buyer: users.buyer.email,
    password: shown,
  });

  const demoUserIds = [users.admin.id, users.seller.id, users.buyer.id];
  const keepListingIds = IS_PRODUCTION ? [] : DEMO_LISTINGS.map((l) => l.id);
  const reset = await resetDemoData(demoUserIds, keepListingIds);
  console.log("Reset demo data:", reset);

  if (IS_PRODUCTION) {
    console.log(
      "NODE_ENV=production — no demo listings seeded; the marketplace shows only real listings.",
    );
    return;
  }

  const { listings, lots } = await upsertDemoListings(users, categoryIdBySlug);
  console.log(
    `Demo listings upserted: ${listings} (${lots} lots) across ${
      new Set(DEMO_LISTINGS.map((l) => l.category)).size
    } categories.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
