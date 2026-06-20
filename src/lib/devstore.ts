// File-backed persistence for no-DB ("browse + sell") local development.
//
// When DATABASE_URL is unset, the seller flow writes here instead of Neon so
// the whole create-a-store / upload-a-listing experience works in the preview.
// Data lives in .data/*.json (gitignored). In production this module is unused.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Listing, Store } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORES_FILE = path.join(DATA_DIR, "stores.json");
const LISTINGS_FILE = path.join(DATA_DIR, "listings.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

// The single "you" store for no-login local development.
export const MY_STORE_SLUG = "my-store";

const DEFAULT_STORE: Store = {
  id: "store-mine",
  slug: MY_STORE_SLUG,
  name: "My Store",
  tagline: "A little of this, a little of that",
  description: "Welcome to my shop — vintage finds and collectables I love.",
  theme: {
    primary: "#4f46e5",
    accent: "#10b981",
    banner_url: null,
    logo_url: null,
    layout: "grid",
  },
};

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

export async function getDevStores(): Promise<Store[]> {
  const stores = await readJson<Store[]>(STORES_FILE, []);
  if (!stores.find((s) => s.slug === MY_STORE_SLUG)) {
    stores.unshift(DEFAULT_STORE);
  }
  return stores;
}

export async function getMyStore(): Promise<Store> {
  const stores = await getDevStores();
  return stores.find((s) => s.slug === MY_STORE_SLUG) ?? DEFAULT_STORE;
}

export async function saveMyStore(patch: Partial<Omit<Store, "id" | "slug">>): Promise<Store> {
  const stores = await getDevStores();
  const idx = stores.findIndex((s) => s.slug === MY_STORE_SLUG);
  const base = idx >= 0 ? stores[idx] : DEFAULT_STORE;
  const updated: Store = {
    ...base,
    ...patch,
    theme: { ...base.theme, ...(patch.theme ?? {}) },
  };
  if (idx >= 0) stores[idx] = updated;
  else stores.unshift(updated);
  await writeJson(STORES_FILE, stores);
  return updated;
}

export async function getDevListings(): Promise<Listing[]> {
  return readJson<Listing[]>(LISTINGS_FILE, []);
}

export type NewListing = Omit<Listing, "id" | "store" | "status" | "created_at">;

export async function addDevListing(input: NewListing): Promise<Listing> {
  const [store, listings] = await Promise.all([getMyStore(), getDevListings()]);
  const listing: Listing = {
    ...input,
    id: `l-${randomUUID().slice(0, 8)}`,
    store,
    status: "active",
    created_at: new Date().toISOString(),
  };
  listings.unshift(listing);
  await writeJson(LISTINGS_FILE, listings);
  return listing;
}

export interface DevOrder {
  id: string;
  listing_id: string;
  title: string;
  amount_cents: number;
  email: string;
  name: string;
  address: string;
  create_account: boolean;
  marketing_opt_in: boolean;
  created_at: string;
}

export async function addDevOrder(
  input: Omit<DevOrder, "id" | "created_at">,
): Promise<DevOrder> {
  const orders = await readJson<DevOrder[]>(ORDERS_FILE, []);
  const order: DevOrder = {
    ...input,
    id: `o-${randomUUID().slice(0, 8)}`,
    created_at: new Date().toISOString(),
  };
  orders.unshift(order);
  await writeJson(ORDERS_FILE, orders);
  return order;
}

// Persist an uploaded image to /public/uploads and return its public path.
export async function saveUploadedImage(file: File): Promise<string> {
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = `${randomUUID()}.${ext || "jpg"}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(uploadsDir, name), bytes);
  return `/uploads/${name}`;
}
