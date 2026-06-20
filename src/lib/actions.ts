"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import type { CategorySlug, StoreTheme } from "./types";
import {
  MY_STORE_SLUG,
  addDevListing,
  getMyStore,
  saveMyStore,
  saveUploadedImage,
} from "./devstore";
import { analyzeListingPhotos, type ListingSuggestion } from "./ai";

export type ActionState = { ok: boolean; error?: string };

export type AnalyzeState = {
  ok: boolean;
  suggestion?: ListingSuggestion;
  error?: string;
};

// Photo-first step: scan the uploaded photo(s) and return form suggestions.
export async function analyzePhotos(
  _prev: AnalyzeState,
  formData: FormData,
): Promise<AnalyzeState> {
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Add at least one photo to scan." };

  const images = await Promise.all(
    files.slice(0, 4).map(async (f) => ({
      base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
      mimeType: f.type || "image/jpeg",
    })),
  );

  const suggestion = await analyzeListingPhotos(images);
  return { ok: true, suggestion };
}

function dollarsToCents(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// Store an uploaded image and return its URL. Falls back to local /public
// storage until Cloudflare R2 credentials are configured.
async function uploadImage(file: File): Promise<string | null> {
  if (!file || file.size === 0) return null;
  // TODO: when R2_* env is set, upload to Cloudflare R2 and return the CDN URL.
  return saveUploadedImage(file);
}

// ---------------------------------------------------------------------------
// Create a listing
// ---------------------------------------------------------------------------
export async function createListing(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const title = String(formData.get("title") ?? "").trim();
  const priceCents = dollarsToCents(formData.get("price"));
  const category = String(formData.get("category") ?? "") as CategorySlug;

  if (!title) return { ok: false, error: "Please add a title." };
  if (priceCents == null) return { ok: false, error: "Please enter a valid price." };

  const description = String(formData.get("description") ?? "").trim();
  const condition = String(formData.get("condition") ?? "").trim() || null;
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const size = String(formData.get("size") ?? "").trim() || null;
  const allowOffers = formData.get("allow_offers") === "on";
  const minOfferCents = allowOffers ? dollarsToCents(formData.get("min_offer")) : null;

  const files = formData.getAll("images").filter((f): f is File => f instanceof File);
  const uploaded = (await Promise.all(files.map(uploadImage))).filter(
    (u): u is string => Boolean(u),
  );
  const images = uploaded.length ? uploaded : ["/seed/comic1.svg"];

  let listingId: string;

  if (!db) {
    const listing = await addDevListing({
      category_slug: category || "collectables",
      title,
      description,
      price_cents: priceCents,
      currency: "usd",
      condition,
      brand,
      size,
      allow_offers: allowOffers,
      min_offer_cents: minOfferCents,
      images,
    });
    listingId = listing.id;
  } else {
    listingId = await createListingInDb({
      title,
      description,
      priceCents,
      category,
      condition,
      brand,
      size,
      allowOffers,
      minOfferCents,
      images,
    });
  }

  revalidatePath("/");
  revalidatePath(`/store/${MY_STORE_SLUG}`);
  redirect(`/listings/${listingId}`);
}

// ---------------------------------------------------------------------------
// Save store customization
// ---------------------------------------------------------------------------
export async function saveStore(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Your store needs a name." };

  const theme: Partial<StoreTheme> = {
    primary: String(formData.get("primary") ?? "#4f46e5"),
    accent: String(formData.get("accent") ?? "#10b981"),
  };
  const patch = {
    name,
    tagline: String(formData.get("tagline") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    theme: theme as StoreTheme,
  };

  if (!db) {
    await saveMyStore(patch);
  } else {
    await saveStoreInDb(patch);
  }

  revalidatePath(`/store/${MY_STORE_SLUG}`);
  revalidatePath("/sell/store");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Neon write paths (used when DATABASE_URL is configured)
// ---------------------------------------------------------------------------

// Get-or-create a default seller + store so listings can be written without
// requiring a full auth flow yet. Mirrors the demo seller used by db:seed.
async function ensureMyStore(): Promise<string> {
  if (!db) throw new Error("db not configured");
  const existing = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.slug, MY_STORE_SLUG))
    .limit(1);
  if (existing.length) return existing[0].id;

  const email = "demo-seller@thisnthat.local";
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) {
    [user] = await db
      .insert(schema.users)
      .values({ email, name: "Demo Seller", username: "demo-seller" })
      .returning();
  }
  const store = await getMyStore(); // default shape
  const [row] = await db
    .insert(schema.stores)
    .values({
      ownerId: user.id,
      slug: MY_STORE_SLUG,
      name: store.name,
      tagline: store.tagline,
      description: store.description,
      theme: store.theme,
    })
    .returning();
  return row.id;
}

async function createListingInDb(input: {
  title: string;
  description: string;
  priceCents: number;
  category: CategorySlug;
  condition: string | null;
  brand: string | null;
  size: string | null;
  allowOffers: boolean;
  minOfferCents: number | null;
  images: string[];
}): Promise<string> {
  if (!db) throw new Error("db not configured");
  const storeId = await ensureMyStore();
  const [cat] = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.slug, input.category))
    .limit(1);

  const [listing] = await db
    .insert(schema.listings)
    .values({
      storeId,
      categoryId: cat?.id ?? null,
      title: input.title,
      description: input.description,
      priceCents: input.priceCents,
      currency: "usd",
      condition: input.condition,
      brand: input.brand,
      size: input.size,
      allowOffers: input.allowOffers,
      minOfferCents: input.minOfferCents,
      status: "active",
    })
    .returning();

  if (input.images.length) {
    await db.insert(schema.listingImages).values(
      input.images.map((url, position) => ({ listingId: listing.id, url, position })),
    );
  }
  return listing.id;
}

async function saveStoreInDb(patch: {
  name: string;
  tagline: string | null;
  description: string | null;
  theme: StoreTheme;
}): Promise<void> {
  if (!db) throw new Error("db not configured");
  const storeId = await ensureMyStore();
  await db
    .update(schema.stores)
    .set({
      name: patch.name,
      tagline: patch.tagline,
      description: patch.description,
      theme: patch.theme,
    })
    .where(eq(schema.stores.id, storeId));
}
