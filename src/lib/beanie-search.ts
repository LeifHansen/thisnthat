import "server-only";
import { unstable_cache } from "next/cache";
import { BEANIES } from "@/lib/beanie-database";
import type { BeanieCategory, BeanieEntry, CatalogueRow } from "@/lib/beanie-types";
import { prisma } from "@/lib/db";
import { beaniePhotoKey, realPhotoWhere, firstRealPhoto } from "@/lib/photos";
import { CATALOGUE_IMAGES } from "@/lib/beanie-image-map";
import { median } from "@/lib/sold-stats";

// Server-side catalogue search for /database. Keeps the ~2,700-entry catalogue
// on the server: filters/sorts in memory, then attaches photos + recent-sold
// stats for the returned PAGE only (targeted `in` queries), so per-request cost
// doesn't scale with the catalogue or the sold-item history.

export type CatalogueSearchParams = {
  q?: string;
  category?: string;
  letter?: string;
  collection?: string;
  sort?: "name" | "year";
  offset?: number;
  limit?: number;
};

function firstLetter(name: string): string {
  const c = name.trim()[0]?.toUpperCase() ?? "#";
  return /[A-Z]/.test(c) ? c : "#";
}

// Override rows change only on a superadmin catalogue edit, yet were re-read
// on every /database render and every filter keystroke via /api/beanies.
// Cached as plain rows (a Map wouldn't survive cache serialization).
const loadOverrideRows = unstable_cache(
  () =>
    prisma.beanieOverride.findMany({
      select: {
        normalizedKey: true,
        name: true,
        animal: true,
        category: true,
        year: true,
        styleNumber: true,
        valueLow: true,
        valueHigh: true,
        note: true,
      },
    }),
  ["beanie-overrides"],
  { revalidate: 300 },
);

/** Superadmin field overrides applied on top of the static catalogue. */
async function loadOverrides(): Promise<Map<string, Partial<BeanieEntry>>> {
  const map = new Map<string, Partial<BeanieEntry>>();
  try {
    const rows = await loadOverrideRows();
    for (const r of rows) {
      const ov: Partial<BeanieEntry> = {};
      if (r.name) ov.name = r.name;
      if (r.animal) ov.animal = r.animal;
      if (r.category) ov.category = r.category as BeanieCategory;
      if (r.year != null) ov.year = r.year;
      if (r.styleNumber) ov.styleNumber = r.styleNumber;
      if (r.valueLow != null) ov.valueLow = r.valueLow;
      if (r.valueHigh != null) ov.valueHigh = r.valueHigh;
      if (r.note) ov.note = r.note;
      map.set(r.normalizedKey, ov);
    }
  } catch {
    // DB hiccup → fall back to the static catalogue values
  }
  return map;
}

function applyOverride(b: BeanieEntry, ov?: Partial<BeanieEntry>): BeanieEntry {
  if (!ov) return b;
  return {
    ...b,
    ...(ov.name ? { name: ov.name } : {}),
    ...(ov.animal ? { animal: ov.animal } : {}),
    ...(ov.category ? { category: ov.category } : {}),
    ...(ov.year != null ? { year: ov.year } : {}),
    ...(ov.styleNumber ? { styleNumber: ov.styleNumber } : {}),
    ...(ov.valueLow != null ? { valueLow: ov.valueLow } : {}),
    ...(ov.valueHigh != null ? { valueHigh: ov.valueHigh } : {}),
    ...(ov.note ? { note: ov.note } : {}),
  };
}

export async function searchCatalogue(
  p: CatalogueSearchParams,
): Promise<{ rows: CatalogueRow[]; total: number }> {
  const overrides = await loadOverrides();
  const q = (p.q ?? "").trim().toLowerCase();
  const category = p.category || "All";
  const letter = p.letter || "All";
  const collection = p.collection || "All";
  const sort = p.sort === "year" ? "year" : "name";
  const offset = Math.max(0, p.offset ?? 0);
  const limit = Math.min(200, Math.max(1, p.limit ?? 100));

  // Filter the catalogue on the effective (override-merged) values.
  const filtered: { originalName: string; key: string; e: BeanieEntry }[] = [];
  for (const b of BEANIES) {
    const key = beaniePhotoKey(b.name);
    const e = applyOverride(b, overrides.get(key));
    if (collection !== "All" && (e.collection ?? "original") !== collection) continue;
    if (category !== "All" && e.category !== category) continue;
    if (letter !== "All" && firstLetter(e.name) !== letter) continue;
    if (
      q &&
      !`${e.name} ${e.animal} ${e.category} ${e.styleNumber ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      continue;
    filtered.push({ originalName: b.name, key, e });
  }
  filtered.sort((a, b) =>
    sort === "year"
      ? (a.e.year ?? Infinity) - (b.e.year ?? Infinity) ||
        a.e.name.localeCompare(b.e.name)
      : a.e.name.localeCompare(b.e.name),
  );

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);
  const pageKeys = page.map((x) => x.key);
  const pageNames = page.map((x) => x.originalName);

  // Photos for the page (newest active real marketplace photo > BeanieImage
  // (AI/manual) > static licensed map) plus recent-sold medians. All three
  // queries are independent, so they run concurrently; each falls back to
  // empty on its own failure (photos degrade to the static map / placeholder,
  // sold stats to none).
  const soldFrom = new Date();
  soldFrom.setUTCMonth(soldFrom.getUTCMonth() - 12);
  const [listings, images, sold] = await Promise.all([
    prisma.listing
      .findMany({
        where: { status: "ACTIVE", beanieName: { in: pageNames }, ...realPhotoWhere },
        orderBy: { createdAt: "desc" },
        select: { beanieName: true, photos: true },
        // Only the newest real photo per name is kept — without a bound, one
        // popular beanie with hundreds of listings returns them all.
        take: pageNames.length * 3,
      })
      .catch(() => []),
    prisma.beanieImage
      .findMany({
        where: { normalizedKey: { in: pageKeys } },
        select: { normalizedKey: true, url: true },
      })
      .catch(() => []),
    prisma.soldItem
      .findMany({
        where: { normalizedKey: { in: pageKeys }, soldAt: { gte: soldFrom } },
        select: { normalizedKey: true, priceCents: true },
      })
      .catch(() => []),
  ]);

  const photoByKey = new Map<string, string>();
  for (const l of listings) {
    const k = beaniePhotoKey(l.beanieName);
    const photo = firstRealPhoto(l.photos);
    if (k && photo && !photoByKey.has(k)) photoByKey.set(k, photo);
  }
  for (const img of images) {
    if (!photoByKey.has(img.normalizedKey)) photoByKey.set(img.normalizedKey, img.url);
  }

  // Recent-sold (last 12 months) medians for the page keys.
  const soldByKey = new Map<string, { median: number; count: number }>();
  {
    const acc = new Map<string, number[]>();
    for (const s of sold) {
      const a = acc.get(s.normalizedKey);
      if (a) a.push(s.priceCents);
      else acc.set(s.normalizedKey, [s.priceCents]);
    }
    for (const [k, prices] of acc) {
      const m = median(prices);
      if (m != null) soldByKey.set(k, { median: m, count: prices.length });
    }
  }

  const rows: CatalogueRow[] = page.map(({ originalName, key, e }) => {
    const sold = soldByKey.get(key);
    return {
      originalName,
      name: e.name,
      animal: e.animal,
      category: e.category,
      year: e.year,
      styleNumber: e.styleNumber ?? null,
      valueLow: e.valueLow ?? null,
      valueHigh: e.valueHigh ?? null,
      note: e.note ?? null,
      birthday: e.birthday ?? null,
      collection: e.collection ?? "original",
      photoUrl: photoByKey.get(key) ?? CATALOGUE_IMAGES[key]?.src ?? null,
      soldMedianCents: sold?.median ?? null,
      soldCount: sold?.count ?? 0,
    };
  });

  return { rows, total };
}
