/**
 * Batch-import catalogue images for /database entries that currently show only
 * the placeholder — i.e. entries with no marketplace photo and no catalogue
 * image yet.
 *
 * Reads scripts/data/beanie-image-manifest.json (rows of
 * { name, url, sourceUrl, license, credit }), downloads/reads each image,
 * compresses it to a 480px WebP under public/beanie-images/, and regenerates
 * src/lib/beanie-image-map.ts. Original-era entries are processed first, in
 * batches (default 100 per run) — rerun until it reports nothing left.
 *
 * LICENSING GUARD: rows without both a license and a credit are refused. This
 * enforces the project policy that only openly licensed or owned images enter
 * the catalogue — the site never displays scraped/unlicensed photos. `url` may
 * be a local file path for photos you own.
 *
 * Usage (from a machine with normal internet access):
 *   npx tsx scripts/import-beanie-images.ts                 # original, 100
 *   npx tsx scripts/import-beanie-images.ts --batch=50
 *   npx tsx scripts/import-beanie-images.ts --collection=all
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { BEANIES } from "../src/lib/beanie-database";
import { beaniePhotoKey } from "../src/lib/photos";
import {
  CATALOGUE_IMAGES,
  type CatalogueImage,
} from "../src/lib/beanie-image-map";

const MANIFEST_PATH = join(__dirname, "data", "beanie-image-manifest.json");
const MAP_PATH = join(__dirname, "..", "src", "lib", "beanie-image-map.ts");
const OUT_DIR = join(__dirname, "..", "public", "beanie-images");

type ManifestRow = {
  name: string;
  url: string;
  sourceUrl: string;
  license: string;
  credit: string;
  note?: string;
};

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

async function loadImage(url: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url, {
      headers: { "User-Agent": "BeanieXchange-catalogue/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFileSync(url); // photos you own, referenced by local path
}

function writeMap(map: Record<string, CatalogueImage>) {
  const header = readFileSync(MAP_PATH, "utf8").split(
    "export const CATALOGUE_IMAGES",
  )[0];
  const sorted = Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(
    MAP_PATH,
    header +
      "export const CATALOGUE_IMAGES: Record<string, CatalogueImage> = " +
      JSON.stringify(sorted, null, 2) +
      ";\n",
  );
}

async function main() {
  const batch = Number(arg("batch", "100"));
  const collection = arg("collection", "original"); // original | expanded | all

  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      `No manifest at ${MANIFEST_PATH}.\n` +
        "Create one with scripts/build-commons-manifest.ts (openly licensed\n" +
        "Wikimedia files) and/or add rows for photos you own.",
    );
    process.exit(1);
  }
  const manifest: ManifestRow[] = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const rowByKey = new Map<string, ManifestRow>();
  for (const row of manifest) {
    if (row.name) rowByKey.set(beaniePhotoKey(row.name), row);
  }

  // Placeholder-only = no catalogue image yet. (Marketplace photos are a
  // runtime concern — they always outrank catalogue images, so importing one
  // for a listed beanie is harmless.) Original era first, then by name.
  const targets = BEANIES.filter((b) => {
    const coll = b.collection ?? "original";
    if (collection !== "all" && coll !== collection) return false;
    return !(beaniePhotoKey(b.name) in CATALOGUE_IMAGES);
  }).sort(
    (a, b) =>
      (a.collection ?? "original").localeCompare(b.collection ?? "original") ||
      a.name.localeCompare(b.name),
  );

  const map = { ...CATALOGUE_IMAGES };
  mkdirSync(OUT_DIR, { recursive: true });

  let imported = 0;
  let noRow = 0;
  let refused = 0;
  let failed = 0;

  for (const b of targets) {
    if (imported >= batch) break;
    const key = beaniePhotoKey(b.name);
    const row = rowByKey.get(key);
    if (!row) {
      noRow++;
      continue;
    }
    if (!row.license?.trim() || !row.credit?.trim()) {
      refused++;
      console.warn(`REFUSED (no license/credit — policy): ${b.name}`);
      continue;
    }
    try {
      const buf = await loadImage(row.url);
      const out = join(OUT_DIR, `${key}.webp`);
      await sharp(buf).resize({ width: 480 }).webp({ quality: 78 }).toFile(out);
      map[key] = {
        src: `/beanie-images/${key}.webp`,
        sourceUrl: row.sourceUrl,
        license: row.license.trim(),
        credit: row.credit.trim(),
      };
      imported++;
      console.log(`✓ ${b.name}`);
    } catch (e) {
      failed++;
      console.warn(`✗ ${b.name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  writeMap(map);
  const remaining = targets.length - imported - noRow - refused - failed;
  console.log(
    `\nImported ${imported} · no manifest row ${noRow} · refused ${refused} · ` +
      `failed ${failed} · still queued this collection ${Math.max(0, remaining)}`,
  );
  console.log(
    "Map updated: src/lib/beanie-image-map.ts — commit it together with public/beanie-images/.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
