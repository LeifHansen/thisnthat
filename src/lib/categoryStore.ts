import "server-only";
import { prisma } from "@/lib/db";
import { CATEGORIES, getCategory, type CategoryDef } from "@/lib/categories";

/**
 * The Category table is seeded from src/lib/categories.ts, but a listing
 * write must never fail because a fresh database skipped the seed. This
 * resolves a slug to its row id, creating the row from the static definition
 * when it is missing. The upsert is idempotent and the id is cached per
 * process afterwards.
 */
const idBySlug = new Map<string, string>();

export async function categoryIdForSlug(slug: string): Promise<string> {
  const cached = idBySlug.get(slug);
  if (cached) return cached;
  const def = getCategory(slug);
  if (!def) throw new Error(`Unknown category: ${slug}`);
  const row = await prisma.category.upsert({
    where: { slug },
    update: {},
    create: rowFromDef(def, CATEGORIES.indexOf(def)),
    select: { id: true },
  });
  idBySlug.set(slug, row.id);
  return row.id;
}

/** Column values for a Category row built from its static definition. */
export function rowFromDef(def: CategoryDef, position: number) {
  return {
    slug: def.slug,
    name: def.name,
    position,
    // Stored as plain JSON so non-app readers (admin tooling, SQL) can see
    // the fields; the app itself reads the typed definition.
    attributeSchema: def.attributes.map((f) => ({ ...f })),
  };
}

/**
 * Upsert every category. Called by the seed and safe to call at any time —
 * it only ever adds rows or refreshes name/position/schema, never deletes
 * (a listing may still point at a category that left the static list).
 */
export async function syncCategories(): Promise<number> {
  let n = 0;
  for (const [i, def] of CATEGORIES.entries()) {
    const row = rowFromDef(def, i);
    await prisma.category.upsert({
      where: { slug: def.slug },
      update: { name: row.name, position: row.position, attributeSchema: row.attributeSchema },
      create: row,
    });
    n++;
  }
  return n;
}
