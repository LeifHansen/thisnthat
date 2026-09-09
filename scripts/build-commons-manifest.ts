/**
 * Build (or extend) the catalogue image manifest from Wikimedia Commons.
 *
 * Queries the Commons API for every file in a category (default:
 * Category:Beanie_Babies), pulls each file's direct URL, license, and author,
 * fuzzy-matches filenames to catalogue entry names, and writes the rows into
 * scripts/data/beanie-image-manifest.json (merging with whatever is already
 * there — existing rows are never clobbered).
 *
 * Only openly licensed files make it into the manifest; anything without
 * license metadata is skipped and reported. Review the manifest (especially
 * rows with an empty `name`, which need a manual match) before running
 * scripts/import-beanie-images.ts.
 *
 * Usage (from a machine with normal internet access):
 *   npx tsx scripts/build-commons-manifest.ts
 *   npx tsx scripts/build-commons-manifest.ts "Category:Ty_Inc."
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { BEANIES } from "../src/lib/beanie-database";
import { beaniePhotoKey } from "../src/lib/photos";

const MANIFEST_PATH = join(__dirname, "data", "beanie-image-manifest.json");
const API = "https://commons.wikimedia.org/w/api.php";

type ManifestRow = {
  /** Catalogue entry name (must match a BEANIES name); empty = needs manual match. */
  name: string;
  /** Direct image URL (or local file path) the importer downloads. */
  url: string;
  /** Human page documenting the file (for the credits page). */
  sourceUrl: string;
  license: string;
  credit: string;
  /** Builder notes, e.g. ambiguous match candidates. Ignored by the importer. */
  note?: string;
};

async function api(params: Record<string, string>) {
  const qs = new URLSearchParams({ format: "json", origin: "*", ...params });
  const res = await fetch(`${API}?${qs}`, {
    headers: { "User-Agent": "BeanieXchange-catalogue/1.0 (image attribution tooling)" },
  });
  if (!res.ok) throw new Error(`Commons API ${res.status}`);
  return res.json();
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

/** Match a Commons filename to catalogue entries by normalized inclusion. */
function matchNames(filename: string): string[] {
  const hay = beaniePhotoKey(filename.replace(/^File:/, "").replace(/\.\w+$/, ""));
  const hits: string[] = [];
  for (const b of BEANIES) {
    const key = beaniePhotoKey(b.name);
    if (key.length >= 3 && hay.includes(key)) hits.push(b.name);
  }
  // Prefer the longest (most specific) match when one name contains another,
  // e.g. "Peace" vs "Peace bear" style overlaps.
  const longest = Math.max(0, ...hits.map((h) => beaniePhotoKey(h).length));
  const best = hits.filter((h) => beaniePhotoKey(h).length === longest);
  return best;
}

async function main() {
  const category = process.argv[2] ?? "Category:Beanie_Babies";

  const existing: ManifestRow[] = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
    : [];
  const seen = new Set(existing.map((r) => r.sourceUrl));

  // 1. Every file in the category.
  const members: string[] = [];
  let cont: string | undefined;
  do {
    const data = await api({
      action: "query",
      list: "categorymembers",
      cmtitle: category,
      cmtype: "file",
      cmlimit: "500",
      ...(cont ? { cmcontinue: cont } : {}),
    });
    for (const m of data.query?.categorymembers ?? []) members.push(m.title);
    cont = data.continue?.cmcontinue;
  } while (cont);
  console.log(`${category}: ${members.length} files`);

  // 2. URL + license + author per file.
  let added = 0;
  let skippedNoLicense = 0;
  for (const title of members) {
    const data = await api({
      action: "query",
      titles: title,
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "800",
    });
    const pages = data.query?.pages ?? {};
    const info = (Object.values(pages)[0] as {
      imageinfo?: {
        thumburl?: string;
        url?: string;
        descriptionurl?: string;
        extmetadata?: Record<string, { value?: string }>;
      }[];
    })?.imageinfo?.[0];
    if (!info) continue;

    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value ?? "");
    const credit = stripHtml(meta.Artist?.value ?? meta.Credit?.value ?? "");
    const sourceUrl = info.descriptionurl ?? "";
    const url = info.thumburl ?? info.url ?? "";
    if (!url || seen.has(sourceUrl)) continue;
    if (!license) {
      skippedNoLicense++;
      console.warn(`  SKIP (no license metadata): ${title}`);
      continue;
    }

    const matches = matchNames(title);
    existing.push({
      name: matches.length === 1 ? matches[0] : "",
      url,
      sourceUrl,
      license,
      credit: credit || "Wikimedia Commons contributor",
      ...(matches.length === 1
        ? {}
        : { note: matches.length ? `ambiguous: ${matches.join(" | ")}` : "no name match — fill manually" }),
    });
    seen.add(sourceUrl);
    added++;
  }

  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(existing, null, 2) + "\n");
  console.log(
    `Manifest: +${added} rows (${skippedNoLicense} skipped without license metadata) → ${MANIFEST_PATH}`,
  );
  const unmatched = existing.filter((r) => !r.name).length;
  if (unmatched) {
    console.log(`${unmatched} rows need a manual "name" before importing.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
