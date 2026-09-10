// Seller handles: the public identity in /u/<handle>.
//
// Lowercase letters, digits and single hyphens, 3–30 characters, unique across
// users, and never a word that is (or could become) a route, a role or a
// support-sensitive name. Kept dependency-free so both the profile action and
// the /u/[id] resolver can use it.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// Route segments, brand names and anything that reads as official. A handle
// only needs to be unique among users, but "/u/admin" or "/u/support" would
// read as the platform speaking.
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "about", "account", "accounts", "admin", "administrator", "api", "app", "auth",
  "billing", "blog", "browse", "cart", "categories", "category", "checkout",
  "contact", "dashboard", "dev", "docs", "faq", "fees", "guest", "help", "home",
  "legal", "listing", "listings", "login", "logout", "lot", "lots", "mail", "me",
  "messages", "mod", "moderator", "new", "null", "official", "orders", "owner",
  "payouts", "privacy", "profile", "register", "returns", "root", "sell",
  "seller", "settings", "shop", "signin", "signout", "signup", "site", "staff",
  "static", "stripe", "support", "system", "team", "terms", "test", "thisnthat",
  "this-n-that", "u", "undefined", "unsubscribe", "user", "users", "www",
]);

/** Lowercase + trim; strips a leading "@" people naturally type. */
export function normalizeHandle(raw: unknown): string {
  return String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}

export type HandleCheck =
  | { ok: true; handle: string }
  | { ok: false; error: string };

/**
 * Validate a handle the seller typed. Returns the normalized handle or the
 * first human-readable problem. Uniqueness is the database's job
 * (`@unique`) — the caller maps the constraint error to a message.
 */
export function validateHandle(raw: unknown): HandleCheck {
  const handle = normalizeHandle(raw);
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) {
    return { ok: false, error: `Handles are ${HANDLE_MIN}–${HANDLE_MAX} characters.` };
  }
  if (!HANDLE_RE.test(handle) || handle.includes("--")) {
    return {
      ok: false,
      error: "Use lowercase letters, numbers and single hyphens (no leading or trailing hyphen).",
    };
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { ok: false, error: "That handle is reserved — pick another." };
  }
  return { ok: true, handle };
}

/** True when a path segment can only be a handle (never a cuid). */
export function looksLikeHandle(segment: string): boolean {
  return validateHandle(segment).ok;
}

/** Public profile path for a user: their handle when set, else their id. */
export function sellerPath(user: { id: string; handle?: string | null }): string {
  return `/u/${user.handle || user.id}`;
}
