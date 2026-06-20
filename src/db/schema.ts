// ThisNThat — Drizzle schema (Neon Postgres)
// Multi-tenant marketplace: vintage clothing, shoes, accessories,
// sports memorabilia, collectables. Fixed-price + offers, no auctions.

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uuid,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ---------------------------------------------------------------------------
// Auth.js adapter tables (users / accounts / sessions / verification tokens)
// ---------------------------------------------------------------------------
// Platform roles. `super_admin` can administer every tenant/store; `admin`
// is reserved for future staff; everyone else is a regular `user`.
export const userRole = pgEnum("user_role", ["user", "admin", "super_admin"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  // marketplace profile fields
  username: text("username").unique(),
  role: userRole("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---------------------------------------------------------------------------
// Stores — each seller owns one customizable storefront (Shopify-style)
// ---------------------------------------------------------------------------
export type StoreTheme = {
  primary: string;
  accent: string;
  banner_url: string | null;
  logo_url: string | null;
  layout: "grid" | "list";
};

const DEFAULT_THEME: StoreTheme = {
  primary: "#4f46e5",
  accent: "#10b981",
  banner_url: null,
  logo_url: null,
  layout: "grid",
};

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    tagline: text("tagline"),
    description: text("description"),
    theme: jsonb("theme").$type<StoreTheme>().notNull().default(DEFAULT_THEME),
    stripeAccountId: text("stripe_account_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("stores_owner_idx").on(t.ownerId)],
);

// ---------------------------------------------------------------------------
// Categories — fixed marketplace taxonomy
// ---------------------------------------------------------------------------
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Listings — fixed-price items, optionally accepting offers
// ---------------------------------------------------------------------------
export const listingStatus = pgEnum("listing_status", [
  "draft",
  "active",
  "sold",
  "removed",
]);

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id),
    title: text("title").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    condition: text("condition"),
    brand: text("brand"),
    size: text("size"),
    // offers: sellers opt in per-listing, like eBay/Depop "Best Offer"
    allowOffers: boolean("allow_offers").notNull().default(true),
    minOfferCents: integer("min_offer_cents"),
    status: listingStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("listings_store_idx").on(t.storeId),
    index("listings_category_idx").on(t.categoryId),
    index("listings_status_idx").on(t.status),
  ],
);

export const listingImages = pgTable(
  "listing_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("listing_images_listing_idx").on(t.listingId)],
);

// ---------------------------------------------------------------------------
// Offers — buyer proposes a price; seller accepts/declines/counters
// ---------------------------------------------------------------------------
export const offerStatus = pgEnum("offer_status", [
  "pending",
  "accepted",
  "declined",
  "countered",
  "expired",
]);

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    message: text("message"),
    status: offerStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("offers_listing_idx").on(t.listingId),
    index("offers_buyer_idx").on(t.buyerId),
  ],
);

// ---------------------------------------------------------------------------
// Orders — a completed purchase (fixed price or accepted offer)
// ---------------------------------------------------------------------------
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    amountCents: integer("amount_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull().default(0),
    status: orderStatus("status").notNull().default("pending"),
    stripePaymentIntent: text("stripe_payment_intent"),
    stripeCheckoutSession: text("stripe_checkout_session"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("orders_buyer_idx").on(t.buyerId),
    index("orders_store_idx").on(t.storeId),
  ],
);
