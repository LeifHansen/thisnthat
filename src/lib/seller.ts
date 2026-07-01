// Seller-side helpers: resolve the store the current seller manages and guard
// the Seller Hub. Read-only — creating a store happens lazily on first write
// (see ensureStoreForCurrentUser in actions).
//
// Resolution order:
//   - no database        → the file-backed dev store (no-login local mode)
//   - db, auth not set up → the legacy shared "my-store" (transient: db wired
//                           but auth keys not added yet)
//   - db + auth          → the logged-in user's own store (true multi-tenancy)

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser, isAuthConfigured, type CurrentUser } from "@/auth";
import { DEFAULT_THEME } from "@/db/schema";
import { getStoreBySlug, rowToStore } from "./data";
import { getMyStore, MY_STORE_SLUG } from "./devstore";
import type { Store } from "./types";

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "store"
  );
}

// Require a signed-in seller. In no-auth/dev mode the hub stays open (returns
// null); with auth configured, anonymous visitors are sent to /login.
export async function requireSeller(): Promise<CurrentUser | null> {
  if (!isAuthConfigured) return null;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

async function findUserStore(userId: string): Promise<Store | null> {
  if (!db) return null;
  const [row] = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.ownerId, userId))
    .limit(1);
  return row ? rowToStore(row) : null;
}

// An unsaved store template seeded from the user, shown in the editor before
// their first save.
function templateStore(user: CurrentUser): Store {
  const base = user.name || user.email.split("@")[0];
  return {
    id: "unsaved",
    slug: slugify(base),
    name: user.name ? `${user.name}'s store` : "My Store",
    tagline: "A little of this, a little of that",
    description: null,
    theme: DEFAULT_THEME,
  };
}

// The store shown in the Seller Hub editor (never null — falls back to a
// template so the form always renders).
export async function getSellerStore(): Promise<Store> {
  if (!db) return getMyStore();
  if (!isAuthConfigured) {
    return (await getStoreBySlug(MY_STORE_SLUG)) ?? (await getMyStore());
  }
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (await findUserStore(user.id)) ?? templateStore(user);
}

// The seller's real, saved store — or null if they haven't created one yet.
// Used by the "View storefront" link to decide where to send them.
export async function getSellerStoreOrNull(): Promise<Store | null> {
  if (!db) return getMyStore();
  if (!isAuthConfigured) return getStoreBySlug(MY_STORE_SLUG);
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return findUserStore(user.id);
}
