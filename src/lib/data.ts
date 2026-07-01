// Data-access layer.
//
// When Neon is configured (DATABASE_URL set) these read from the database via
// Drizzle. Otherwise they fall back to in-memory seed data so the marketplace
// is fully browsable locally before any infrastructure is wired up.

import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import type { Category, Listing, Store, CategorySlug } from "./types";
import * as seed from "./seed";
import { getDevListings, getDevStores } from "./devstore";

export function rowToStore(s: typeof schema.stores.$inferSelect): Store {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    theme: s.theme,
  };
}

export async function getCategories(): Promise<Category[]> {
  if (!db) return [...seed.categories].sort((a, b) => a.sort - b.sort);
  const rows = await db.select().from(schema.categories).orderBy(schema.categories.sort);
  return rows as Category[];
}

export async function getListings(
  filter?: { category?: CategorySlug; storeSlug?: string },
): Promise<Listing[]> {
  if (!db) {
    const dev = await getDevListings();
    let items = [...dev, ...seed.listings].filter((l) => l.status === "active");
    if (filter?.category) items = items.filter((l) => l.category_slug === filter.category);
    if (filter?.storeSlug) items = items.filter((l) => l.store.slug === filter.storeSlug);
    return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  const rows = await db
    .select({
      listing: schema.listings,
      store: schema.stores,
      categorySlug: schema.categories.slug,
    })
    .from(schema.listings)
    .innerJoin(schema.stores, eq(schema.listings.storeId, schema.stores.id))
    .leftJoin(schema.categories, eq(schema.listings.categoryId, schema.categories.id))
    .where(eq(schema.listings.status, "active"))
    .orderBy(desc(schema.listings.createdAt));

  const listings = await Promise.all(
    rows.map((r) => hydrateListing(r.listing, r.store, r.categorySlug)),
  );

  return listings.filter((l) => {
    if (filter?.category && l.category_slug !== filter.category) return false;
    if (filter?.storeSlug && l.store.slug !== filter.storeSlug) return false;
    return true;
  });
}

export async function getListingById(id: string): Promise<Listing | null> {
  if (!db) {
    const dev = await getDevListings();
    return [...dev, ...seed.listings].find((l) => l.id === id) ?? null;
  }

  const [row] = await db
    .select({
      listing: schema.listings,
      store: schema.stores,
      categorySlug: schema.categories.slug,
    })
    .from(schema.listings)
    .innerJoin(schema.stores, eq(schema.listings.storeId, schema.stores.id))
    .leftJoin(schema.categories, eq(schema.listings.categoryId, schema.categories.id))
    .where(eq(schema.listings.id, id))
    .limit(1);

  if (!row) return null;
  return hydrateListing(row.listing, row.store, row.categorySlug);
}

export async function getStoreBySlug(slug: string): Promise<Store | null> {
  if (!db) {
    const dev = await getDevStores();
    return [...dev, ...seed.stores].find((s) => s.slug === slug) ?? null;
  }
  const [row] = await db.select().from(schema.stores).where(eq(schema.stores.slug, slug)).limit(1);
  return row ? rowToStore(row) : null;
}

export async function getAllStores(): Promise<Store[]> {
  if (!db) {
    const dev = await getDevStores();
    const all = [...dev, ...seed.stores];
    return all.filter((s, i) => all.findIndex((x) => x.slug === s.slug) === i);
  }
  const rows = await db.select().from(schema.stores).orderBy(desc(schema.stores.createdAt));
  return rows.map(rowToStore);
}

// Pull a listing's images and assemble the API-facing Listing shape.
async function hydrateListing(
  l: typeof schema.listings.$inferSelect,
  s: typeof schema.stores.$inferSelect,
  categorySlug: string | null,
): Promise<Listing> {
  const images = db
    ? await db
        .select()
        .from(schema.listingImages)
        .where(eq(schema.listingImages.listingId, l.id))
        .orderBy(schema.listingImages.position)
    : [];

  return {
    id: l.id,
    store: rowToStore(s),
    category_slug: (categorySlug ?? "collectables") as CategorySlug,
    title: l.title,
    description: l.description ?? "",
    price_cents: l.priceCents,
    currency: l.currency,
    condition: l.condition,
    brand: l.brand,
    size: l.size,
    allow_offers: l.allowOffers,
    min_offer_cents: l.minOfferCents,
    status: l.status,
    images: images.map((i) => i.url),
    created_at: l.createdAt.toISOString(),
  };
}
