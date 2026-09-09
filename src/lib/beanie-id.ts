import { BEANIES, type BeanieEntry } from "@/lib/beanie-database";
import { beaniePhotoKey } from "@/lib/photos";

// Robust beanie-name → catalogue-entry resolution + ranked text recommendations.
//
// Sellers (and the AI draft) write names like "Princess the Bear", "Ty Cubbie",
// or "princess diana bear"; the catalogue stores "Princess" and
// "Brownie / Cubbie". Plain exact-match linking fails on all of those. This
// module powers text-driven catalogue linking: resolveBeanie() confidently
// resolves a typed name (normalize, strip decorations, then unique-prefix
// match, never guessing between two beanies), and rankCatalogueMatches()
// returns the most-likely entries to recommend as the seller types.

const byKey = new Map<string, BeanieEntry>();
for (const b of BEANIES) {
  const k = beaniePhotoKey(b.name);
  if (k && !byKey.has(k)) byKey.set(k, b);
  // Compound names ("Brownie / Cubbie") resolve from each part.
  for (const part of b.name.split("/")) {
    const pk = beaniePhotoKey(part);
    if (pk && !byKey.has(pk)) byKey.set(pk, b);
  }
}

// Normalized search fields per entry, computed once: /api/beanies/suggest
// calls rankCatalogueMatches per keystroke, and lower-casing + word-splitting
// + key-normalizing all ~2,700 entries on every call added up.
const SEARCHABLE: ReadonlyArray<{
  b: BeanieEntry;
  name: string;
  words: string[];
  bKey: string;
  animal: string;
}> = BEANIES.map((b) => {
  const name = b.name.toLowerCase();
  return {
    b,
    name,
    words: name.split(/[^a-z0-9]+/).filter(Boolean),
    bKey: beaniePhotoKey(b.name),
    animal: b.animal.toLowerCase(),
  };
});

// Browse-mode (empty query) default: curated originals first, then the rest.
const BROWSE_DEFAULT: ReadonlyArray<BeanieEntry> = [
  ...BEANIES.filter((b) => b.collection !== "expanded"),
  ...BEANIES.filter((b) => b.collection === "expanded"),
];

/** Noise words that appear around beanie names but are never part of one. */
function stripDecorations(name: string): string {
  return name
    .replace(/\b(ty|beanie|babies|baby|original|retired|vintage|rare)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a free-text beanie name to its catalogue entry, or null.
 * Tries progressively looser interpretations but only returns an entry when
 * the match is unambiguous.
 */
export function resolveBeanie(raw: string): BeanieEntry | null {
  const name = (raw ?? "").trim();
  if (!name) return null;

  const attempts = [
    name,
    stripDecorations(name),
    // "Princess the Bear" → "Princess"; "Patti The Platypus" → "Patti"
    name.split(/\s+the\s+/i)[0],
    stripDecorations(name).split(/\s+the\s+/i)[0],
  ];
  for (const a of attempts) {
    const hit = byKey.get(beaniePhotoKey(a));
    if (hit) return hit;
  }

  // Last resort: a unique key-prefix match either direction ("Milleni" →
  // "Millennium"). The shared prefix must be ≥4 chars on BOTH sides — the
  // expanded roster has single-letter alphabet bears ("M", "P", "Z") that
  // would otherwise swallow any name starting with their letter. Ambiguity
  // (≥2 hits) means no link — never guess.
  const key = beaniePhotoKey(stripDecorations(name));
  if (key.length >= 4) {
    const hits: BeanieEntry[] = [];
    for (const [k, b] of byKey) {
      if (k.length < 4) continue;
      if ((k.startsWith(key) || key.startsWith(k)) && !hits.includes(b)) {
        hits.push(b);
        if (hits.length > 1) break;
      }
    }
    if (hits.length === 1) return hits[0];
  }

  return null;
}

/**
 * Rank catalogue entries by how likely they are the beanie the seller is
 * typing, best first. Drives the name field's "recommended matches" dropdown
 * — the seller links by picking one (or the top match auto-links via
 * resolveBeanie). Matches on name (exact → prefix → word-start → substring),
 * with animal and style-number as secondary signals. Empty query returns the
 * curated original-era catalogue first (a useful browse default).
 */
export function rankCatalogueMatches(
  query: string,
  limit = 50,
): BeanieEntry[] {
  const raw = (query ?? "").trim().toLowerCase();
  if (!raw) {
    // Browse mode: curated originals first (they carry values + notes), then
    // the rest of the roster, capped.
    return BROWSE_DEFAULT.slice(0, limit);
  }
  const key = beaniePhotoKey(stripDecorations(query));

  const scored: { b: BeanieEntry; score: number }[] = [];
  for (const s of SEARCHABLE) {
    const { b, name, words, bKey, animal } = s;
    let score = 0;

    if (name === raw || (key && bKey === key)) score = 1000;
    else if (name.startsWith(raw)) score = 800;
    else if (key && bKey.startsWith(key)) score = 720;
    else if (words.some((w) => w.startsWith(raw))) score = 600;
    else if (name.includes(raw)) score = 400;
    else if (animal.startsWith(raw)) score = 220;
    else if (animal.includes(raw)) score = 140;
    else if ((b.styleNumber ?? "").includes(raw)) score = 150;

    if (score === 0) continue;
    // Tie-breakers: curated originals over the expanded roster, then shorter
    // (closer-length) names first.
    if (b.collection !== "expanded") score += 20;
    score -= Math.min(name.length, 40) * 0.5;
    scored.push({ b, score });
  }
  scored.sort(
    (a, z) => z.score - a.score || a.b.name.localeCompare(z.b.name),
  );
  return scored.slice(0, limit).map((s) => s.b);
}
