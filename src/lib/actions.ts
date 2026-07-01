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
  addDevOrder,
  getMyStore,
  saveMyStore,
  saveUploadedImage,
} from "./devstore";
import { analyzeListingPhotos, type ListingSuggestion } from "./ai";
import { getListingById } from "./data";
import {
  getStripe,
  isStripeConfigured,
  platformFeeCents,
  appUrl,
} from "./stripe";
import { signIn, signOut, getCurrentUser, isAuthConfigured } from "@/auth";
import { slugify } from "./seller";

// ---------------------------------------------------------------------------
// Authentication actions
// ---------------------------------------------------------------------------
export async function devSignIn(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  await signIn("dev", { email, redirectTo: "/" });
}

export async function googleSignIn(): Promise<void> {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

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
  revalidatePath("/store/[slug]", "page");
  redirect(`/listings/${listingId}`);
}

// ---------------------------------------------------------------------------
// Guest checkout
// ---------------------------------------------------------------------------
export type CheckoutState = {
  ok: boolean;
  orderId?: string;
  createdAccount?: boolean;
  error?: string;
};

export async function placeOrder(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const listingId = String(formData.get("listing_id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const createAccount = formData.get("create_account") === "on";
  const marketingOptIn = formData.get("marketing_opt_in") === "on";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email." };
  }
  if (!name || !address) {
    return { ok: false, error: "Please add your name and shipping address." };
  }

  const listing = await getListingById(listingId);
  if (!listing) return { ok: false, error: "This item is no longer available." };

  // No database → local demo order.
  if (!db) {
    const order = await addDevOrder({
      listing_id: listing.id,
      title: listing.title,
      amount_cents: listing.price_cents,
      email,
      name,
      address,
      create_account: createAccount,
      marketing_opt_in: marketingOptIn,
    });
    return { ok: true, orderId: order.id, createdAccount: createAccount };
  }

  // Record the order as pending first (so it exists regardless of payment
  // path). If the buyer is signed in, attribute the order to their account;
  // otherwise fall back to a guest user keyed by email.
  const buyer = await getCurrentUser();
  const orderId = await placeOrderInDb({
    listing,
    email,
    name,
    address,
    buyerUserId: buyer?.id ?? null,
    amountCents: listing.price_cents,
  });

  // If Stripe is configured and the seller is onboarded, route the buyer
  // through Stripe Checkout (destination charge with platform fee). On
  // success Stripe returns to /checkout/success.
  const stripe = getStripe();
  const sellerAccount = await getStoreStripeAccount(listing.store.id);
  if (stripe && sellerAccount) {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: listing.currency,
            unit_amount: listing.price_cents,
            product_data: { name: listing.title },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: platformFeeCents(listing.price_cents),
        transfer_data: { destination: sellerAccount },
      },
      metadata: { order_id: orderId },
      success_url: `${appUrl()}/checkout/success?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/checkout/${listing.id}`,
    });
    await db
      .update(schema.orders)
      .set({ stripeCheckoutSession: session.id })
      .where(eq(schema.orders.id, orderId));
    redirect(session.url!);
  }

  // No Stripe (or seller not onboarded yet): demo confirmation.
  return { ok: true, orderId, createdAccount: createAccount };
}

// Look up a store's connected Stripe account id (null if not onboarded).
async function getStoreStripeAccount(storeId: string): Promise<string | null> {
  if (!db) return null;
  const [row] = await db
    .select({ acct: schema.stores.stripeAccountId })
    .from(schema.stores)
    .where(eq(schema.stores.id, storeId))
    .limit(1);
  return row?.acct ?? null;
}

// The current seller's connected Stripe account id — scoped to the logged-in
// user's store (or the singleton when auth isn't configured). Read-only.
async function currentSellerStripeAccount(): Promise<string | null> {
  if (!db) return null;
  const where = isAuthConfigured
    ? await (async () => {
        const user = await getCurrentUser();
        return user ? eq(schema.stores.ownerId, user.id) : null;
      })()
    : eq(schema.stores.slug, MY_STORE_SLUG);
  if (!where) return null;
  const [row] = await db
    .select({ acct: schema.stores.stripeAccountId })
    .from(schema.stores)
    .where(where)
    .limit(1);
  return row?.acct ?? null;
}

// Mark an order paid (called from the Stripe webhook and the success page).
export async function markOrderPaid(orderId: string, paymentIntent?: string): Promise<void> {
  if (!db) return;
  await db
    .update(schema.orders)
    .set({ status: "paid", stripePaymentIntent: paymentIntent ?? null })
    .where(eq(schema.orders.id, orderId));
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Seller payouts — Stripe Connect onboarding
// ---------------------------------------------------------------------------
export async function connectStripe(): Promise<void> {
  const stripe = getStripe();
  if (!stripe || !db) {
    redirect("/sell/payments?error=not_configured");
  }
  const storeId = await ensureStoreForCurrentUser();
  const [store] = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.id, storeId))
    .limit(1);

  let accountId = store.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({ type: "express" });
    accountId = account.id;
    await db
      .update(schema.stores)
      .set({ stripeAccountId: accountId })
      .where(eq(schema.stores.id, storeId));
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl()}/sell/payments?refresh=1`,
    return_url: `${appUrl()}/sell/payments?connected=1`,
    type: "account_onboarding",
  });
  redirect(link.url);
}

// Whether the seller's store has completed Stripe onboarding (charges enabled).
export async function getStripeStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  chargesEnabled: boolean;
}> {
  const stripe = getStripe();
  if (!stripe || !db) {
    return { configured: isStripeConfigured, connected: false, chargesEnabled: false };
  }
  const acct = await currentSellerStripeAccount();
  if (!acct) return { configured: true, connected: false, chargesEnabled: false };
  try {
    const account = await stripe.accounts.retrieve(acct);
    return {
      configured: true,
      connected: true,
      chargesEnabled: Boolean(account.charges_enabled),
    };
  } catch {
    return { configured: true, connected: true, chargesEnabled: false };
  }
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

  revalidatePath("/store/[slug]", "page");
  revalidatePath("/sell/store");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Neon write paths (used when DATABASE_URL is configured)
// ---------------------------------------------------------------------------

// Resolve the store the current seller writes to, creating it on first use.
// With auth configured this is the logged-in user's own store (multi-tenant);
// anonymous visitors are redirected to sign in. Without auth it falls back to
// a shared singleton store (transient: db wired but auth keys not added yet).
async function ensureStoreForCurrentUser(): Promise<string> {
  if (!db) throw new Error("db not configured");
  if (!isAuthConfigured) return ensureSingletonStore();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [existing] = await db
    .select({ id: schema.stores.id })
    .from(schema.stores)
    .where(eq(schema.stores.ownerId, user.id))
    .limit(1);
  if (existing) return existing.id;

  const slug = await uniqueStoreSlug(user.name || user.email.split("@")[0]);
  const [row] = await db
    .insert(schema.stores)
    .values({
      ownerId: user.id,
      slug,
      name: user.name ? `${user.name}'s store` : "My Store",
      tagline: "A little of this, a little of that",
    })
    .returning();
  return row.id;
}

// A slug derived from `base`, suffixed with -2, -3, … until it's unique.
async function uniqueStoreSlug(base: string): Promise<string> {
  if (!db) throw new Error("db not configured");
  const root = slugify(base);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const [hit] = await db
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .limit(1);
    if (!hit) return slug;
  }
}

// Legacy shared store (demo seller), used only when auth isn't configured.
async function ensureSingletonStore(): Promise<string> {
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
  const storeId = await ensureStoreForCurrentUser();
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

async function placeOrderInDb(input: {
  listing: { id: string; store: { id: string } };
  email: string;
  name: string;
  address: string;
  buyerUserId: string | null;
  amountCents: number;
}): Promise<string> {
  if (!db) throw new Error("db not configured");
  // Prefer the signed-in buyer; otherwise get-or-create a guest user by email.
  let buyerId = input.buyerUserId;
  if (!buyerId) {
    let [buyer] = await db.select().from(schema.users).where(eq(schema.users.email, input.email));
    if (!buyer) {
      [buyer] = await db
        .insert(schema.users)
        .values({ email: input.email, name: input.name })
        .returning();
    }
    buyerId = buyer.id;
  }
  const [order] = await db
    .insert(schema.orders)
    .values({
      listingId: input.listing.id,
      buyerId,
      storeId: input.listing.store.id,
      amountCents: input.amountCents,
      platformFeeCents: platformFeeCents(input.amountCents),
      shippingName: input.name,
      shippingAddress: input.address,
      status: "pending",
    })
    .returning();
  return order.id;
}

async function saveStoreInDb(patch: {
  name: string;
  tagline: string | null;
  description: string | null;
  theme: StoreTheme;
}): Promise<void> {
  if (!db) throw new Error("db not configured");
  const storeId = await ensureStoreForCurrentUser();
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
