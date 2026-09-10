/**
 * Typed client for the Beanie Xchange web API (the Next.js app in the repo
 * root). The mobile app is a thin native frontend over the same backend —
 * no separate mobile API exists.
 *
 * Point EXPO_PUBLIC_API_URL at a local dev server (http://localhost:3000 from
 * the iOS simulator) or leave it unset to hit production.
 */

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? "https://beaniexchange.com"
).replace(/\/+$/, "");

// ── Mirrors of the web app's response shapes ────────────────────────────
// Source of truth: src/lib/listings.ts in the repo root (BeanieOption,
// ListingCardData) and src/app/api/listings/route.ts. Keep in sync by hand
// until a shared types package is split out (see mobile/README.md roadmap).

export type AuthType =
  | "TRUE_BLUE"
  | "BX_FULL_SERVICE"
  | "BX_EXPRESS_COA"
  | "THIRD_PARTY_COA"
  | "UNAUTHENTICATED";

export type ListingCard = {
  id: string;
  title: string;
  beanieName: string;
  priceCents: number;
  photos: string[];
  authType: AuthType;
  registrationNumber: string | null;
  grade: string | null;
  sellerId: string;
  status: string;
  quantity: number;
};

/** One storefront card: all active listings of a beanie grouped together. */
export type BeanieOption = {
  beanieName: string;
  year: number | null;
  photo: string | null;
  optionCount: number;
  minCents: number;
  maxCents: number;
  cheapest: ListingCard;
};

export type BeanieGroupsPage = {
  items: BeanieOption[];
  nextOffset: number | null;
};

/** One comparable option on the detail screen. */
export type ListingSummary = {
  id: string;
  title: string;
  beanieName: string;
  priceCents: number;
  photos: string[];
  authType: AuthType;
  condition: string;
};

/** Full listing detail. Source of truth: src/app/api/listings/[id]/route.ts. */
export type ListingDetail = {
  id: string;
  title: string;
  beanieName: string;
  year: number | null;
  condition: string;
  description: string;
  priceCents: number;
  photos: string[];
  authType: AuthType;
  grade: string | null;
  registrationNumber: string | null;
  trueBlueCertId: string | null;
  bxCertId: string | null;
  quantity: number;
  status: string;
  sold: boolean;
  /** A bundle sold as one listing — `lotItems` says what's in it. */
  isLot: boolean;
  lotItems: { beanieName: string; year: number | null; quantity: number }[];
  /** Total beanies across the lot, 0 when this isn't a lot. */
  lotPieces: number;
  unauthenticated: boolean;
  fees: {
    itemCents: number;
    platformFeeCents: number;
    platformFeeLabel: string;
    shipToBuyerCents: number;
    totalCents: number;
    /** Item price minus the platform fee — what the seller nets. */
    sellerProceedsCents: number;
  };
  seller: { id: string; name: string; avatarUrl: string | null };
  otherOptions: ListingSummary[];
  webUrl: string;
};

// ── Auth ────────────────────────────────────────────────────────────────
// The auth provider (src/lib/auth.tsx) sets the bearer token here so every
// request carries it. Kept in a module variable so non-hook call sites (the
// plain fetch helpers) can read it without threading it through every call.
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
/** Whether a bearer token is loaded — i.e. whether there's a session to carry. */
export function hasAuthToken(): boolean {
  return authToken !== null;
}

// The auth provider registers a handler so any authed request that comes back
// 401 mid-session (expired/revoked/suspended token) signs the user out —
// clearing the token + user + keychain — instead of leaving a stale "signed in"
// UI until the next app launch.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}
function handleUnauthorized(status: number) {
  // Only for token-bearing requests — an anonymous 401 isn't a session issue.
  if (status === 401 && authToken && onUnauthorized) onUnauthorized();
}

export type MobileUser = {
  id: string;
  name: string;
  displayName: string | null;
  email: string;
  role: "USER" | "ADMIN";
  avatarUrl: string | null;
};

function authHeaders(): Record<string, string> {
  return authToken ? { authorization: `Bearer ${authToken}` } : {};
}

/** Error carrying the HTTP status + server-provided message. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { accept: "application/json", ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleUnauthorized(res.status);
    throw new ApiError(
      res.status,
      (data as { error?: string })?.error ?? `Request failed (${res.status}).`,
    );
  }
  return data as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleUnauthorized(res.status);
    throw new ApiError(res.status, (data as { error?: string })?.error ?? "Request failed.");
  }
  return data as T;
}

export type AuthResponse = { token: string; user: MobileUser };

/** Sign in with email + password. Rejects with ApiError on bad credentials. */
export function apiLogin(email: string, password: string): Promise<AuthResponse> {
  return postJson<AuthResponse>("/api/mobile/auth/login", { email, password });
}

/** Create an account. `agreedToTerms` must be true (server-enforced). */
export function apiRegister(input: {
  name: string;
  email: string;
  password: string;
  agreedToTerms: boolean;
}): Promise<AuthResponse> {
  return postJson<AuthResponse>("/api/mobile/auth/register", input);
}

/**
 * Re-hydrate the current user from a stored token; rejects (401) if invalid.
 * `shipping` is the address saved on the account, or null when there isn't a
 * complete one — checkout uses it to prefill.
 */
export function apiMe(): Promise<{ user: MobileUser; shipping: ShipAddress | null }> {
  return getJson<{ user: MobileUser; shipping: ShipAddress | null }>("/api/mobile/me");
}

/**
 * Delete the signed-in account permanently (App Store Guideline 5.1.1(v)).
 *
 * Rejects with a 409 ApiError, whose message explains the wait, when the
 * account still has an order in escrow or in transit.
 */
export async function apiDeleteAccount(): Promise<void> {
  const res = await fetch(`${API_URL}/api/mobile/me`, {
    method: 'DELETE',
    headers: { accept: 'application/json', ...authHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    handleUnauthorized(res.status);
    throw new ApiError(
      res.status,
      (data as { error?: string })?.error ?? "Couldn't delete your account.",
    );
  }
}

// ── Checkout ────────────────────────────────────────────────────────────
// Source of truth: src/app/api/checkout/route.ts and
// src/app/api/mobile/checkout/quote/route.ts in the repo root.

export type ShipAddress = {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
};

export type CheckoutQuote = {
  items: {
    listingId: string;
    title: string;
    itemCents: number;
    shipToBuyerCents: number;
    totalCents: number;
    /** False when EasyPost couldn't rate it and the flat fallback was used. */
    shippingRated: boolean;
  }[];
  totalCents: number;
};

export type CheckoutResult = {
  cartId: string;
  /** Orders whose card needs 3-D Secure; finish each with handleNextAction. */
  requiresAction: { orderId: string; clientSecret: string }[];
  orders: { id: string; guestToken: string | null }[];
};

/** The Stripe publishable key, which is a runtime value on the server. */
export function apiStripeConfig(): Promise<{ stripePublishableKey: string }> {
  return getJson<{ stripePublishableKey: string }>("/api/mobile/config");
}

/**
 * Price a purchase with live-rated shipping — what the buyer must be shown
 * before paying, since /api/checkout refuses to authorize a total the buyer
 * didn't see.
 */
export function apiCheckoutQuote(
  listingIds: string[],
  ship: ShipAddress,
): Promise<CheckoutQuote> {
  return postJson<CheckoutQuote>("/api/mobile/checkout/quote", { listingIds, ship });
}

/**
 * Authorize payment. One manual-capture PaymentIntent per listing is created
 * and confirmed server-side against `paymentMethodId`; money is held in escrow
 * until the item is confirmed received.
 *
 * `checkoutId` makes the POST idempotent — reuse the same one when retrying an
 * attempt so a network-level retry can't charge the buyer twice.
 */
export function apiCheckout(input: {
  listingIds: string[];
  ship: ShipAddress;
  paymentMethodId: string;
  checkoutId: string;
  expectedTotalCents: number;
}): Promise<CheckoutResult> {
  return postJson<CheckoutResult>("/api/checkout", input);
}

/**
 * Mint a single-use token that opens a web page already signed in.
 * See openWeb() in src/lib/handoff.ts — call that, not this.
 */
export function apiHandoffToken(): Promise<{ token: string; expiresInSeconds: number }> {
  return postJson<{ token: string; expiresInSeconds: number }>("/api/mobile/handoff", {});
}

/** Paginated storefront grid (12 per page). Pass the previous nextOffset. */
export function fetchBeanieGroups(offset = 0): Promise<BeanieGroupsPage> {
  return getJson<BeanieGroupsPage>(`/api/listings?offset=${offset}`);
}

/** Full detail for one listing. Rejects (404) on missing/draft/removed. */
export function fetchListing(id: string): Promise<ListingDetail> {
  return getJson<ListingDetail>(`/api/listings/${encodeURIComponent(id)}`);
}

/**
 * Resized thumbnail variant of a photo for small grid cells, served through
 * the web app's next/image optimizer (R2 hosts are allowlisted there and it
 * re-encodes to AVIF/WebP). Full-size originals are 500KB+ — far too heavy
 * for a 2-column storefront grid on cellular. `w` must be one of next/image's
 * configured widths. Detail screens should keep the original URL.
 */
export function thumbUrl(
  url: string | null | undefined,
  width: 384 | 640 = 384,
): string | undefined {
  if (!url) return undefined;
  return `${API_URL}/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;
}

/** Human label for an authentication tier, matching the web AuthBadge copy. */
export function authLabel(authType: AuthType): string {
  switch (authType) {
    case "TRUE_BLUE":
      return "True Blue Verified";
    case "BX_FULL_SERVICE":
      return "BX Authenticated";
    case "BX_EXPRESS_COA":
      return "BX Express COA";
    case "THIRD_PARTY_COA":
      return "Third-Party COA";
    default:
      return "Unauthenticated";
  }
}

/** Site-relative path for a listing's detail page. Pass to openWeb(). */
export function listingWebPath(listingId: string): string {
  return `/listings/${listingId}`;
}

// ── Selling ─────────────────────────────────────────────────────────────
// Source of truth: src/lib/validation.ts (listingSchema) and
// src/app/api/mobile/listings/route.ts in the repo root.

export type NewListing = {
  title: string;
  beanieName: string;
  description?: string;
  condition: string;
  year?: number;
  price: number;
  quantity?: number;
  authType: AuthType;
  photos: string[];
};

/** A photo chosen on the device, in the shape RN's FormData wants. */
export type LocalPhoto = { uri: string; name: string; type: string };

/**
 * Upload listing photos to R2 through the web app's upload route, which
 * auto-levels and watermarks them on the way in — the same treatment web
 * uploads get. Returns the public URLs to put in `photos`.
 *
 * Multipart, and deliberately without a content-type header: React Native
 * fills one in with the multipart boundary, and setting it here would
 * overwrite that with a value the server can't parse.
 */
export async function apiUploadPhotos(photos: LocalPhoto[]): Promise<{ urls: string[] }> {
  const form = new FormData();
  for (const photo of photos) {
    // RN accepts a {uri,name,type} part; the DOM FormData types don't know it.
    form.append('files', photo as unknown as Blob);
  }

  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers: { accept: 'application/json', ...authHeaders() },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleUnauthorized(res.status);
    throw new ApiError(res.status, (data as { error?: string })?.error ?? 'Upload failed.');
  }
  return data as { urls: string[] };
}

/** Publish a listing (or save it as a draft). */
export function apiCreateListing(
  listing: NewListing,
  options: { draft?: boolean } = {},
): Promise<{ id: string }> {
  return postJson<{ id: string }>('/api/mobile/listings', {
    ...listing,
    draft: options.draft === true,
  });
}

/** Site-relative path for the sell flow. Pass to openWeb(). */
export function sellWebPath(): string {
  return "/sell";
}

// Module-level formatters — Intl.NumberFormat construction is expensive and
// formatCents runs per card/fee-row on every render.
const USD_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const USD_EXACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number): string {
  return (cents % 100 === 0 ? USD_WHOLE : USD_EXACT).format(cents / 100);
}
