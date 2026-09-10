// The seller-facing condition vocabulary, shared by every listing form, the
// browse filters and the badges. One enum for every category — the per-category
// specifics (grade, working, completeness…) live in the category's attribute
// schema (src/lib/categories.ts), not here.

import type { Condition } from "@prisma/client";

export const CONDITIONS: readonly {
  value: Condition;
  label: string;
  hint: string;
}[] = [
  { value: "NEW", label: "New", hint: "Unused, with tags or sealed" },
  { value: "LIKE_NEW", label: "Like new", hint: "Used once or twice, no flaws" },
  { value: "GOOD", label: "Good", hint: "Light wear, works and displays well" },
  { value: "FAIR", label: "Fair", hint: "Noticeable wear, priced accordingly" },
  { value: "FOR_PARTS", label: "For parts", hint: "Damaged or not working" },
];

export const CONDITION_VALUES = CONDITIONS.map((c) => c.value) as [
  Condition,
  ...Condition[],
];

export function isCondition(value: unknown): value is Condition {
  return CONDITIONS.some((c) => c.value === value);
}

export function conditionLabel(value: Condition | string | null | undefined): string {
  return CONDITIONS.find((c) => c.value === value)?.label ?? String(value ?? "");
}

// Map a free-text condition guess (what the AI photo pass returns, e.g. "Very
// good, light wear") onto the enum. Ordered so the more specific phrase wins
// ("like new" before "new", "very good" before "good").
const PATTERNS: ReadonlyArray<[RegExp, Condition]> = [
  [/for\s*parts|not\s*working|broken|damaged|poor|repair/i, "FOR_PARTS"],
  [/like[\s-]*new|mint|excellent|pristine|nwot/i, "LIKE_NEW"],
  [/\bnew\b|sealed|unused|nwt|brand\s*new|deadstock/i, "NEW"],
  [/fair|worn|heavy\s*wear|distressed|acceptable/i, "FAIR"],
  [/very\s*good|\bgood\b|gently|light\s*wear|used/i, "GOOD"],
];

/**
 * Canonicalise a condition before it reaches a listing. Returns "" when
 * nothing matches, which the forms surface as "pick a condition" rather than
 * storing a value they can't show again.
 */
export function canonicalCondition(raw: unknown): Condition | "" {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const upper = s.toUpperCase().replace(/[\s-]+/g, "_");
  if (isCondition(upper)) return upper;
  for (const [re, value] of PATTERNS) {
    if (re.test(s)) return value;
  }
  return "";
}
