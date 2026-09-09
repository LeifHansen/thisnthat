// The seller-facing listing vocabulary, shared by the full Sell form and the
// first-listing wizard. Browse filters and sold comps bucket listings by
// these exact strings, so the two listing paths must never drift apart —
// which is why they both import from here instead of carrying copies.

export const LISTING_CONDITIONS = [
  { value: "MWMT — Mint With Mint Tags", hint: "Like new, tags perfect" },
  {
    value: "MWMT-MQ — Mint With Mint Tags, Museum Quality",
    hint: "Flawless — collector grade",
  },
  {
    value: "MINT — Mint condition, usually assumed with tags if stated clearly",
    hint: "Like new overall",
  },
  { value: "NM — Near Mint", hint: "Tiny flaws on close inspection" },
  { value: "EX — Excellent", hint: "Light wear, displays great" },
  { value: "VG — Very Good", hint: "Noticeable wear, still lovely" },
  { value: "G — Good", hint: "Clearly loved and played with" },
  { value: "P — Poor", hint: "Heavy wear — priced accordingly" },
] as const;

/** Is this exactly one of the canonical seller-facing condition values? */
export function isCanonicalCondition(value: string): boolean {
  return LISTING_CONDITIONS.some((c) => c.value === value);
}

// Map a free-text condition guess (what the AI photo pass returns, e.g. "Mint
// with mint tag") onto a canonical option. Ordered so the more specific phrase
// wins ("near mint" before "mint", "very good" before "good").
const AI_CONDITION_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bMWMT-?MQ\b|museum/i, LISTING_CONDITIONS[1].value],
  [/\bMWMT\b/i, LISTING_CONDITIONS[0].value],
  [/\bNM\b|near\s*mint/i, LISTING_CONDITIONS[3].value],
  [/\bmint\b/i, LISTING_CONDITIONS[2].value],
  [/\bEX\b|excellent/i, LISTING_CONDITIONS[4].value],
  [/\bVG\b|very\s*good/i, LISTING_CONDITIONS[5].value],
  [/\bgood\b/i, LISTING_CONDITIONS[6].value],
  [/\bpoor\b/i, LISTING_CONDITIONS[7].value],
];

/**
 * Canonicalise a condition before it reaches a listing. Every listing form
 * picks from LISTING_CONDITIONS, so anything else — an AI guess, a value typed
 * by an older client — would render as *no selection* in those <select>s and
 * silently block the next save. Returns "" when nothing matches, which the
 * forms surface as "pick a condition" rather than storing a value they can't
 * show again.
 */
export function canonicalCondition(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (isCanonicalCondition(s)) return s;
  for (const [re, value] of AI_CONDITION_PATTERNS) {
    if (re.test(s)) return value;
  }
  return "";
}

export const HANG_TAG_OPTIONS = ["Mint", "Good", "Fair", "Missing"] as const;
export type HangTagOption = (typeof HANG_TAG_OPTIONS)[number];

/**
 * Fold the hang-tag rating into the description the way listings store it —
 * as a "Hang tag: …" first line (no schema column needed; it renders at the
 * top of every listing's details).
 */
export function withHangTagLine(hangTag: string, description: string): string {
  const line = `Hang tag: ${hangTag}`;
  return description ? `${line}\n\n${description}` : line;
}
