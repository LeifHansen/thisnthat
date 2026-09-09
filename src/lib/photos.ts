import type { Prisma } from "@prisma/client";

// Single source of truth for "what counts as a real listing photo."
//
// Listings whose owner hasn't uploaded photos yet use a placeholder image (see
// scripts/seed-inventory.ts). For ranking and "featured" purposes the
// placeholder must NOT count as a real picture — listings with genuine photos
// should surface above placeholder-only ones.

/**
 * The placeholder rendered for listings with no real photo yet. WebP (22KB)
 * rather than the 1.7MB source PNG — it's rendered `unoptimized` in grids, so
 * the file is served as-is and its weight hits every visitor directly.
 */
export const PLACEHOLDER_PHOTO = "/placeholderlisting.webp";

// Older rows stored earlier placeholder paths (the BX logo, then the raw PNG).
// Keep recognising them so those listings are still treated as placeholder-only
// (and render the current PLACEHOLDER_PHOTO rather than the heavy original).
const LEGACY_PLACEHOLDERS = ["/bx-logo.png", "/placeholderlisting.png"];
const PLACEHOLDER_PATHS: ReadonlySet<string> = new Set([
  PLACEHOLDER_PHOTO,
  ...LEGACY_PLACEHOLDERS,
]);

/** True if a photo URL is one of our placeholders (current or legacy). */
export function isPlaceholder(photo: string | null | undefined): boolean {
  return !!photo && PLACEHOLDER_PATHS.has(photo);
}

/** True if the listing has at least one genuine (non-placeholder) photo. */
export function hasRealPhoto(
  photos: readonly string[] | null | undefined,
): boolean {
  return !!photos?.some((p) => p && !isPlaceholder(p));
}

/**
 * First genuine (non-placeholder) photo URL, or null. Use this instead of
 * `hasRealPhoto(photos) ? photos[0] : null` — the placeholder can sit at index
 * 0 with a real photo later in the array.
 */
export function firstRealPhoto(
  photos: readonly string[] | null | undefined,
): string | null {
  return photos?.find((p) => p && !isPlaceholder(p)) ?? null;
}

/**
 * Prisma `where` fragment approximating hasRealPhoto at the query layer: the
 * photos array is non-empty and is not exactly a lone placeholder (current or
 * legacy). Used to pull real-photo listings directly (e.g. the homepage
 * "featured" strip).
 */
export const realPhotoWhere: Prisma.ListingWhereInput = {
  photos: { isEmpty: false },
  AND: [PLACEHOLDER_PHOTO, ...LEGACY_PLACEHOLDERS].map((p) => ({
    NOT: { photos: { equals: [p] } },
  })),
};

/**
 * Normalized key for matching a listing's beanieName to a catalogue entry
 * name ("Brownie / Cubbie" and "brownie/cubbie" both → "browniecubbie").
 * Intentionally exact (no substring matching) so an eBay-style long title
 * never false-matches a different beanie's catalogue row.
 */
export function beaniePhotoKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Parse the hidden `photos` form field. Current clients send a JSON array
 * (URLs may legally contain commas); the comma-joined form is accepted as a
 * legacy fallback for any in-flight tabs from before the format change.
 */
export function parsePhotosField(raw: unknown): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr: unknown = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // fall through to legacy parsing
    }
  }
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Whether next/image may optimize this URL — i.e. whether the host is covered
 * by `remotePatterns` in next.config.ts. Anything else must be rendered
 * `unoptimized`, or the optimizer 400s and the image breaks.
 *
 * Local paths are always fine. Remote URLs must be on an R2 host we serve
 * from; legacy photos on other hosts fall back to unoptimized.
 */
const OPTIMIZABLE_HOST = process.env.NEXT_PUBLIC_R2_PUBLIC_HOST ?? "";

export function canOptimizeImage(url: string | null | undefined): boolean {
  if (!url) return true; // local placeholder
  if (url.startsWith("/")) return true;
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".r2.dev") || (!!OPTIMIZABLE_HOST && host === OPTIMIZABLE_HOST);
  } catch {
    return false;
  }
}
