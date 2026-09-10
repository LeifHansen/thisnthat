// Browse filter parsing + Prisma where-building, shared by /browse and the
// /api/listings load-more endpoint so a URL from one pages identically in the
// other. Every param is whitelisted here: a stale, typo'd or hand-edited URL
// can only ever be ignored, never turn into a PrismaClientValidationError.
//
// Not a Next.js convention file — page.tsx / route.ts may only export their
// handler fields, so the helpers they share live in this sibling module.

import type { Condition, Prisma } from "@prisma/client";
import { facetFields, getCategory, type CategoryDef } from "@/lib/categories";
import { isCondition } from "@/lib/listingOptions";
import { searchListingIds, type ListingSort } from "@/lib/listings";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const SORTS: readonly { value: ListingSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

/** Query-param prefix for per-category facet filters: `attr.size=M`. */
export const ATTR_PREFIX = "attr.";

export type BrowseFilters = {
  q: string;
  category: CategoryDef | null;
  condition: Condition | null;
  /** Price bounds in dollars as entered (validated), null when absent. */
  min: number | null;
  max: number | null;
  sort: ListingSort;
  /** The lots view (`type=lots`). */
  lots: boolean;
  /** 1-based page. */
  page: number;
  /** Facet values keyed by attribute key — only the selected category's facet fields survive. */
  attrs: Record<string, string>;
};

function first(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? "").trim();
}

function dollars(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function isSort(v: string): v is ListingSort {
  return SORTS.some((s) => s.value === v);
}

/**
 * Whitelist raw search params into a filter set. Unknown categories,
 * conditions, sorts and facet values fall back to "no filter"; `minPrice` /
 * `maxPrice` are accepted as aliases of `min` / `max` for API callers.
 */
export function parseBrowseParams(sp: RawSearchParams): BrowseFilters {
  const category = getCategory(first(sp.category));
  const condition = first(sp.condition);
  const sort = first(sp.sort);
  const pageRaw = Number.parseInt(first(sp.page), 10);

  const attrs: Record<string, string> = {};
  if (category) {
    for (const field of facetFields(category)) {
      const v = first(sp[`${ATTR_PREFIX}${field.key}`]).slice(0, 120);
      if (!v) continue;
      if (field.type === "select" && !field.options.includes(v)) continue;
      attrs[field.key] = v;
    }
  }

  return {
    q: first(sp.q).slice(0, 200),
    category,
    condition: isCondition(condition) ? condition : null,
    min: dollars(first(sp.min) || first(sp.minPrice)),
    max: dollars(first(sp.max) || first(sp.maxPrice)),
    sort: isSort(sort) ? sort : "newest",
    lots: first(sp.type) === "lots",
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
    attrs,
  };
}

/**
 * The canonical query string for a filter set. `page` is deliberately left
 * out: every filter change starts over at page 1, and only the pagination
 * links add it back.
 */
export function filterParams(f: BrowseFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.lots) p.set("type", "lots");
  if (f.category) p.set("category", f.category.slug);
  if (f.condition) p.set("condition", f.condition);
  if (f.min !== null) p.set("min", String(f.min));
  if (f.max !== null) p.set("max", String(f.max));
  if (f.sort !== "newest") p.set("sort", f.sort);
  for (const [k, v] of Object.entries(f.attrs)) p.set(`${ATTR_PREFIX}${k}`, v);
  return p;
}

/** `/browse?…` for a filter set, optionally tweaked (`p.set` / `p.delete`). */
export function browseHref(
  f: BrowseFilters,
  mutate?: (p: URLSearchParams) => void,
): string {
  const p = filterParams(f);
  mutate?.(p);
  const s = p.toString();
  return s ? `/browse?${s}` : "/browse";
}

/**
 * Prisma where for a filter set. Callers layer FOR_SALE / isLot on top via
 * getListingsPage / getLots. `q` is resolved through full-text search up
 * front; an empty hit list becomes `id IN ()`, which Prisma answers with no
 * rows — so a miss never falls back to "everything".
 */
export async function buildBrowseWhere(
  f: BrowseFilters,
): Promise<Prisma.ListingWhereInput> {
  const where: Prisma.ListingWhereInput = {};
  if (f.category) where.category = { slug: f.category.slug };
  if (f.condition) where.condition = f.condition;
  if (f.min !== null || f.max !== null) {
    where.priceCents = {
      ...(f.min !== null ? { gte: Math.round(f.min * 100) } : {}),
      ...(f.max !== null ? { lte: Math.round(f.max * 100) } : {}),
    };
  }
  // One JSON filter per facet — `attributes` can only appear once per
  // where object, so several facets go through AND.
  const facets = Object.entries(f.attrs);
  if (facets.length > 0) {
    where.AND = facets.map(([key, value]) => ({
      attributes: { path: [key], equals: value },
    }));
  }
  if (f.q) {
    const ids = await searchListingIds(f.q);
    where.id = { in: ids ?? [] };
  }
  return where;
}
