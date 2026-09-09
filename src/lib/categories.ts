// The category tree and each category's attribute schema.
//
// This file is the source of truth: prisma/seed.ts writes these rows into the
// Category table (so listings can FK to a category and browse can count per
// category in SQL), and the sell form, listing page and browse facets all
// render from these definitions. Nothing in a component should ever branch on
// a category slug — add a field here and every surface picks it up.
//
// Attribute values are stored on Listing.attributes as { [key]: string }.
// `facet: true` fields are offered as browse filters.

export type AttributeField =
  | {
      key: string;
      label: string;
      type: "text";
      placeholder?: string;
      hint?: string;
      facet?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "select";
      options: readonly string[];
      hint?: string;
      facet?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "number";
      min?: number;
      max?: number;
      placeholder?: string;
      hint?: string;
      facet?: boolean;
    };

export type CategoryDef = {
  slug: string;
  name: string;
  /** One line under the tile / at the top of a filtered browse page. */
  blurb: string;
  /** Tile glyph. Decorative only. */
  emoji: string;
  attributes: readonly AttributeField[];
};

const DECADES = [
  "2020s",
  "2010s",
  "2000s",
  "1990s",
  "1980s",
  "1970s",
  "1960s",
  "1950s or earlier",
] as const;

const DEPARTMENTS = ["Women", "Men", "Unisex", "Kids", "Baby"] as const;

const APPAREL_SIZES = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "3XL",
  "One size",
  "Other (see description)",
] as const;

export const CATEGORIES: readonly CategoryDef[] = [
  {
    slug: "apparel",
    name: "Apparel",
    blurb: "Jackets, tees, denim, dresses, knits and everything in between.",
    emoji: "🧥",
    attributes: [
      { key: "department", label: "Department", type: "select", options: DEPARTMENTS, facet: true },
      { key: "size", label: "Size", type: "select", options: APPAREL_SIZES, facet: true },
      { key: "colour", label: "Colour", type: "text", placeholder: "Indigo", facet: true },
      { key: "era", label: "Era", type: "select", options: DECADES, facet: true },
      { key: "material", label: "Material", type: "text", placeholder: "100% cotton" },
      { key: "measurements", label: "Measurements", type: "text", placeholder: "Pit to pit 22\", length 27\"" },
    ],
  },
  {
    slug: "shoes",
    name: "Shoes",
    blurb: "Sneakers, boots, heels and flats — new in box or well loved.",
    emoji: "👟",
    attributes: [
      { key: "department", label: "Department", type: "select", options: DEPARTMENTS, facet: true },
      { key: "size", label: "Size (US)", type: "text", placeholder: "10.5", facet: true },
      { key: "colour", label: "Colour", type: "text", placeholder: "White / red", facet: true },
      { key: "style", label: "Style", type: "select", options: ["Sneakers", "Boots", "Heels", "Flats", "Sandals", "Loafers", "Other"], facet: true },
      { key: "box", label: "Original box", type: "select", options: ["Yes", "No"] },
    ],
  },
  {
    slug: "accessories",
    name: "Accessories",
    blurb: "Bags, hats, belts, jewellery, watches and sunglasses.",
    emoji: "👜",
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Bag", "Hat", "Belt", "Jewellery", "Watch", "Sunglasses", "Scarf", "Wallet", "Other"], facet: true },
      { key: "colour", label: "Colour", type: "text", placeholder: "Tan", facet: true },
      { key: "material", label: "Material", type: "text", placeholder: "Leather" },
      { key: "era", label: "Era", type: "select", options: DECADES, facet: true },
    ],
  },
  {
    slug: "collectibles-plush",
    name: "Collectibles & Plush",
    blurb: "Plush, figures, memorabilia and the things people collect.",
    emoji: "🧸",
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Plush", "Figure", "Model", "Memorabilia", "Pin or patch", "Other"], facet: true },
      { key: "series", label: "Series / line", type: "text", placeholder: "Funko Pop!" },
      { key: "year", label: "Year", type: "number", min: 1900, max: 2100, placeholder: "1997", facet: true },
      { key: "packaging", label: "Packaging", type: "select", options: ["Sealed", "Opened, complete", "Loose"], facet: true },
    ],
  },
  {
    slug: "trading-cards",
    name: "Trading Cards",
    blurb: "Singles, sets and graded slabs across games and sports.",
    emoji: "🃏",
    attributes: [
      { key: "game", label: "Game / sport", type: "select", options: ["Pokémon", "Magic: The Gathering", "Yu-Gi-Oh!", "Baseball", "Basketball", "Football", "Hockey", "Soccer", "Other"], facet: true },
      { key: "set", label: "Set", type: "text", placeholder: "Base Set" },
      { key: "cardNumber", label: "Card number", type: "text", placeholder: "4/102" },
      { key: "year", label: "Year", type: "number", min: 1900, max: 2100, placeholder: "1999", facet: true },
      { key: "grade", label: "Grade", type: "select", options: ["Ungraded", "PSA 10", "PSA 9", "PSA 8", "PSA 7 or lower", "BGS 10", "BGS 9.5", "BGS 9", "BGS 8.5 or lower", "CGC", "Other grader"], facet: true },
    ],
  },
  {
    slug: "art-prints",
    name: "Art & Prints",
    blurb: "Originals, prints, posters and photography.",
    emoji: "🖼️",
    attributes: [
      { key: "medium", label: "Medium", type: "select", options: ["Original painting", "Print", "Poster", "Photograph", "Drawing", "Mixed media", "Sculpture", "Other"], facet: true },
      { key: "artist", label: "Artist", type: "text", placeholder: "Unknown is fine" },
      { key: "year", label: "Year", type: "number", min: 1500, max: 2100, placeholder: "1985" },
      { key: "dimensions", label: "Dimensions", type: "text", placeholder: "18 × 24 in" },
      { key: "signed", label: "Signed", type: "select", options: ["Yes", "No"], facet: true },
      { key: "framed", label: "Framed", type: "select", options: ["Yes", "No"], facet: true },
    ],
  },
  {
    slug: "home-decor",
    name: "Home & Decor",
    blurb: "Lamps, textiles, furniture, kitchenware and objects for the house.",
    emoji: "🪴",
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Lighting", "Textiles", "Furniture", "Kitchenware", "Wall decor", "Storage", "Other"], facet: true },
      { key: "material", label: "Material", type: "text", placeholder: "Brass" },
      { key: "colour", label: "Colour", type: "text", placeholder: "Olive", facet: true },
      { key: "era", label: "Era", type: "select", options: DECADES, facet: true },
      { key: "dimensions", label: "Dimensions", type: "text", placeholder: "12 × 8 × 8 in" },
    ],
  },
  {
    slug: "pottery-glass",
    name: "Pottery & Glass",
    blurb: "Ceramics, stoneware, porcelain, glassware and crystal.",
    emoji: "🏺",
    attributes: [
      { key: "material", label: "Material", type: "select", options: ["Ceramic", "Porcelain", "Stoneware", "Earthenware", "Glass", "Crystal", "Other"], facet: true },
      { key: "maker", label: "Maker", type: "text", placeholder: "Fiesta" },
      { key: "pattern", label: "Pattern", type: "text", placeholder: "Blue Willow" },
      { key: "year", label: "Year", type: "number", min: 1500, max: 2100, placeholder: "1962" },
      { key: "marked", label: "Maker's mark", type: "select", options: ["Yes", "No"], facet: true },
    ],
  },
  {
    slug: "electronics",
    name: "Electronics",
    blurb: "Consoles, cameras, audio, phones and vintage tech.",
    emoji: "📷",
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Game console", "Camera", "Audio", "Phone", "Computer", "Handheld", "Accessory", "Other"], facet: true },
      { key: "model", label: "Model", type: "text", placeholder: "Game Boy Color" },
      { key: "year", label: "Year", type: "number", min: 1900, max: 2100, placeholder: "1998" },
      { key: "working", label: "Working", type: "select", options: ["Fully working", "Partially working", "Not working / for parts"], facet: true },
      { key: "includes", label: "Includes", type: "text", placeholder: "Original charger and box" },
    ],
  },
  {
    slug: "books-media",
    name: "Books & Media",
    blurb: "Books, vinyl, CDs, films and video games.",
    emoji: "📚",
    attributes: [
      { key: "format", label: "Format", type: "select", options: ["Hardcover", "Paperback", "Vinyl", "CD", "Cassette", "DVD", "Blu-ray", "Video game", "Magazine", "Other"], facet: true },
      { key: "creator", label: "Author / artist", type: "text", placeholder: "Octavia Butler" },
      { key: "year", label: "Year", type: "number", min: 1400, max: 2100, placeholder: "1979" },
      { key: "edition", label: "Edition / pressing", type: "text", placeholder: "First edition" },
      { key: "platform", label: "Platform", type: "text", placeholder: "Nintendo 64" },
    ],
  },
  {
    slug: "toys-games",
    name: "Toys & Games",
    blurb: "Action figures, dolls, board games, building sets and puzzles.",
    emoji: "🎲",
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Action figure", "Doll", "Board game", "Building set", "Puzzle", "Vehicle", "Other"], facet: true },
      { key: "year", label: "Year", type: "number", min: 1900, max: 2100, placeholder: "1994" },
      { key: "ages", label: "Age range", type: "text", placeholder: "8+" },
      { key: "completeness", label: "Completeness", type: "select", options: ["Complete", "Missing pieces (see description)", "Sealed"], facet: true },
    ],
  },
  {
    slug: "other",
    name: "Other",
    blurb: "Everything that doesn't fit a category above.",
    emoji: "📦",
    attributes: [],
  },
];

const BY_SLUG: ReadonlyMap<string, CategoryDef> = new Map(
  CATEGORIES.map((c) => [c.slug, c]),
);

export function getCategory(slug: string | null | undefined): CategoryDef | null {
  if (!slug) return null;
  return BY_SLUG.get(slug) ?? null;
}

export function isCategorySlug(slug: unknown): slug is string {
  return typeof slug === "string" && BY_SLUG.has(slug);
}

/** All slugs, for zod enums and select whitelists. */
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [string, ...string[]];

export type Attributes = Record<string, string>;

const MAX_TEXT = 120;

/**
 * Validate a raw attributes object against a category's schema. Unknown keys
 * are dropped (an older client or a category switch must never smuggle stale
 * fields onto a listing), blanks are omitted, select values must be one of the
 * options, and numbers must parse within their range. Returns the cleaned
 * attributes or the first human-readable problem.
 */
export function validateAttributes(
  category: CategoryDef,
  raw: unknown,
): { ok: true; attributes: Attributes } | { ok: false; error: string } {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const out: Attributes = {};
  for (const field of category.attributes) {
    const v = String(src[field.key] ?? "").trim();
    if (!v) continue;
    if (v.length > MAX_TEXT) {
      return { ok: false, error: `${field.label} is too long (${MAX_TEXT} characters max).` };
    }
    if (field.type === "select") {
      if (!field.options.includes(v)) {
        return { ok: false, error: `${field.label}: pick one of the listed options.` };
      }
    } else if (field.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        return { ok: false, error: `${field.label} should be a number.` };
      }
      if (field.min != null && n < field.min) {
        return { ok: false, error: `${field.label} should be ${field.min} or later.` };
      }
      if (field.max != null && n > field.max) {
        return { ok: false, error: `${field.label} should be ${field.max} or earlier.` };
      }
    }
    out[field.key] = v;
  }
  return { ok: true, attributes: out };
}

/** Coerce whatever Prisma hands back for `Listing.attributes` into a string map. */
export function readAttributes(raw: unknown): Attributes {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Attributes = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null || v === "") continue;
    out[k] = String(v);
  }
  return out;
}

/**
 * Label/value pairs for display, in schema order, skipping blanks. Keys not
 * in the schema (e.g. after a category change) are appended with the key as
 * the label so nothing the seller entered silently disappears.
 */
export function attributeEntries(
  category: CategoryDef | null,
  attributes: Attributes,
): { key: string; label: string; value: string }[] {
  const out: { key: string; label: string; value: string }[] = [];
  const seen = new Set<string>();
  for (const field of category?.attributes ?? []) {
    const v = attributes[field.key];
    seen.add(field.key);
    if (v) out.push({ key: field.key, label: field.label, value: v });
  }
  for (const [key, value] of Object.entries(attributes)) {
    if (!seen.has(key) && value) out.push({ key, label: key, value });
  }
  return out;
}

/** Facet fields (browse filters) for a category. */
export function facetFields(category: CategoryDef): AttributeField[] {
  return category.attributes.filter((f) => f.facet);
}
