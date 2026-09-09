// Human-readable alt/title text for every image we render.
//
// Centralizing this means listing cards, photo carousels and previews get
// consistent, specific alternative text automatically. Because the text is
// derived at render time from the title we already have, it applies to every
// seller's uploads with no per-image authoring. Kept natural rather than
// keyword-stuffed, which search engines penalize.

/**
 * Alt/title text for a marketplace listing photo. Seller-written titles are
 * already descriptive; we add a photo index for multi-photo listings.
 */
export function listingImageAlt(
  title: string,
  opts?: { index?: number; total?: number },
): string {
  const clean = (title ?? "").trim() || "Listing photo";
  const total = opts?.total ?? 0;
  const n = opts?.index != null ? opts.index + 1 : undefined;
  return n && total > 1 ? `${clean} (photo ${n})` : clean;
}

/**
 * A URL-safe slug for a name, e.g. "Levi's 501 Jacket" → "levi-s-501-jacket".
 * Used to name uploaded objects after the item (a readable filename) rather
 * than a random string.
 */
export function slugify(name: string, fallback = "item"): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  );
}
