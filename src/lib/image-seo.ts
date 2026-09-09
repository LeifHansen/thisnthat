// SEO-friendly, human-readable alt/title text for every image we render.
//
// Centralizing this means all beanie imagery — catalogue thumbnails, listing
// cards, photo carousels, option cards — gets consistent, keyword-rich
// alternative text automatically. Because the text is derived at render time
// from the name/title we already have, it applies retroactively to existing
// content AND to every future upload by any user, with no per-image authoring.
//
// Alt text is the accessibility- and SEO-critical attribute (screen readers +
// image search read it); we keep it natural and specific rather than stuffing
// keywords, which search engines penalize.

const BRAND = "Ty Beanie Baby";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True if the text already references Beanie Babies (so we don't repeat it). */
function mentionsBeanie(text: string): boolean {
  return /beanie/i.test(text);
}

/**
 * Alt/title text for a catalogue beanie image (the /database table, option
 * cards). Produces e.g. "Peace — Ty Beanie Baby bear (1996)" or, when the name
 * already says "Beanie", the name plus year.
 */
export function beanieImageAlt(
  name: string,
  opts?: { animal?: string | null; year?: number | null },
): string {
  const clean = name.trim();
  if (!clean) return BRAND;
  const animal = opts?.animal?.trim();
  const year = opts?.year ?? undefined;
  // Only add the animal descriptor when the name doesn't already contain it
  // ("Spot the Dog" shouldn't become "…Beanie Baby dog dog").
  const includesAnimal =
    !!animal && new RegExp(`\\b${escapeRe(animal)}\\b`, "i").test(clean);
  const descriptor =
    animal && !includesAnimal ? `${BRAND} ${animal.toLowerCase()}` : BRAND;
  const base = mentionsBeanie(clean) ? clean : `${clean} — ${descriptor}`;
  return year ? `${base} (${year})` : base;
}

/** Alt for a catalogue row still showing the generic placeholder image. */
export function beaniePlaceholderAlt(name: string): string {
  const clean = name.trim();
  return clean ? `${clean} ${BRAND} — photo coming soon` : `${BRAND} placeholder`;
}

/**
 * Alt/title text for a marketplace listing photo. Seller-written titles are
 * already descriptive, so we only ensure the "Beanie Baby" keyword is present
 * and add a photo index for multi-photo listings. Applies to every seller's
 * uploads automatically.
 */
export function listingImageAlt(
  title: string,
  opts?: { index?: number; total?: number },
): string {
  const clean = (title ?? "").trim() || "Beanie Baby listing";
  const base = mentionsBeanie(clean) ? clean : `${clean} — ${BRAND}`;
  const total = opts?.total ?? 0;
  const n = opts?.index != null ? opts.index + 1 : undefined;
  return n && total > 1 ? `${base} (photo ${n})` : base;
}

/**
 * A URL-safe, SEO-friendly slug for a beanie name, e.g. "#1 Teacher" →
 * "1-teacher". Used to name uploaded catalogue image objects after the beanie
 * (a keyword-rich filename) rather than a random string.
 */
export function beanieSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "beanie"
  );
}
