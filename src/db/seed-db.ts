// Seeds Neon with the sample stores, categories, and listings from
// src/lib/seed.ts. Run with: npm run db:seed
//
// Requires DATABASE_URL. Idempotent on categories; creates a demo seller user
// to own the sample stores.

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import * as seed from "../lib/seed";

async function main() {
  if (!db) {
    throw new Error("DATABASE_URL is not set — cannot seed.");
  }

  // Demo seller owns all sample stores.
  const demoEmail = "demo-seller@thisnthat.local";
  let [seller] = await db.select().from(schema.users).where(eq(schema.users.email, demoEmail));
  if (!seller) {
    [seller] = await db
      .insert(schema.users)
      .values({ email: demoEmail, name: "Demo Seller", username: "demo-seller" })
      .returning();
  }

  // Categories
  for (const c of seed.categories) {
    await db
      .insert(schema.categories)
      .values({ slug: c.slug, name: c.name, sort: c.sort })
      .onConflictDoNothing({ target: schema.categories.slug });
  }
  const catRows = await db.select().from(schema.categories);
  const catBySlug = new Map(catRows.map((c) => [c.slug, c.id]));

  // Stores
  const storeIdBySlug = new Map<string, string>();
  for (const s of seed.stores) {
    const existing = await db.select().from(schema.stores).where(eq(schema.stores.slug, s.slug));
    if (existing.length) {
      storeIdBySlug.set(s.slug, existing[0].id);
      continue;
    }
    const [row] = await db
      .insert(schema.stores)
      .values({
        ownerId: seller.id,
        slug: s.slug,
        name: s.name,
        tagline: s.tagline,
        description: s.description,
        theme: s.theme,
      })
      .returning();
    storeIdBySlug.set(s.slug, row.id);
  }

  // Listings + images
  for (const l of seed.listings) {
    const storeId = storeIdBySlug.get(l.store.slug);
    if (!storeId) continue;
    const [row] = await db
      .insert(schema.listings)
      .values({
        storeId,
        categoryId: catBySlug.get(l.category_slug) ?? null,
        title: l.title,
        description: l.description,
        priceCents: l.price_cents,
        currency: l.currency,
        condition: l.condition,
        brand: l.brand,
        size: l.size,
        allowOffers: l.allow_offers,
        minOfferCents: l.min_offer_cents,
        status: "active",
      })
      .returning();

    await db.insert(schema.listingImages).values(
      l.images.map((url, position) => ({ listingId: row.id, url, position })),
    );
  }

  console.log(`Seeded ${seed.stores.length} stores and ${seed.listings.length} listings.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
