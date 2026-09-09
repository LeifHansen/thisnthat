# Catalogue image manifest

`beanie-image-manifest.json` feeds `scripts/import-beanie-images.ts`, which
fills `/database` entries that currently show only the placeholder image.

Row shape:

```json
{
  "name": "Peanut",
  "url": "https://upload.wikimedia.org/…/Peanut.jpg",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:Peanut.jpg",
  "license": "CC BY-SA 4.0",
  "credit": "Jane Photographer"
}
```

- `name` must exactly match a catalogue entry name in
  `src/lib/beanie-database.ts` (empty `name` rows are skipped — fill them in).
- `url` may be an `https://` URL or a **local file path** for photos you own.
- `license` + `credit` are **required** — the importer refuses rows without
  them. This enforces the project policy: only openly licensed or owned
  images enter the catalogue; the site never displays scraped/unlicensed
  photos. Credits render at `/database/credits` (CC licenses require
  attribution).

## Workflow (run from a machine with normal internet access)

```bash
# 1. Pull every openly licensed file from Wikimedia Commons into the manifest
npx tsx scripts/build-commons-manifest.ts

# 2. Review the manifest; fill empty "name" rows; add rows for your own photos

# 3. Import in batches of 100 (original-era entries first); rerun until done
npm run images:import
# or: npx tsx scripts/import-beanie-images.ts --batch=100 --collection=original

# 4. Commit src/lib/beanie-image-map.ts + public/beanie-images/ together
```

Runtime priority on `/database` is unchanged: marketplace listing photos
first, then these catalogue images, then the placeholder.
