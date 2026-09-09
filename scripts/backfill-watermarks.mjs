// One-off backfill: stamp the BX watermark on listing photos uploaded
// BEFORE the watermark feature shipped (commit 2dd2d7e, 2026-07-06T19:11:32Z).
//
//   node --env-file=.env scripts/backfill-watermarks.mjs         # dry run
//   node --env-file=.env scripts/backfill-watermarks.mjs --apply # do it
//
// Already-marked photos are left alone (cutoff by R2 LastModified; backfilled
// keys carry a "-wm" suffix so reruns skip them too). Marked copies go under
// NEW keys — the originals are cached immutable for a year, so overwriting
// in place would leave stale unmarked images at the edge — and every
// listing.photos array is rewritten to the new URL. Originals are kept.
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { readFile } from "fs/promises";

const APPLY = process.argv.includes("--apply");
const CUTOFF = new Date("2026-07-06T19:11:32Z"); // watermark feature ship time
const PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
const BUCKET = process.env.R2_BUCKET;
if (!PUBLIC_URL || !BUCKET) throw new Error("R2 env vars missing");

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const prisma = new PrismaClient();

// ── watermark (mirror of src/lib/watermark.ts) ──
const WATERMARKABLE = /^image\/(png|jpe?g|webp|avif)$/i;
const MARK_SCALE = 0.18;
const MARK_OPACITY = 0.45;
const MARGIN_SCALE = 0.03;
const logoBuf = await readFile("public/bx-watermark.png");

async function watermark(input, mime) {
  if (!WATERMARKABLE.test(mime)) return null;
  const base = sharp(Buffer.from(input)).rotate();
  const { width, height } = await base.metadata();
  if (!width || !height) return null;
  const short = Math.min(width, height);
  const markWidth = Math.max(24, Math.round(short * MARK_SCALE));
  const margin = Math.max(8, Math.round(short * MARGIN_SCALE));
  const mark = await sharp(logoBuf)
    .resize({ width: markWidth })
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([0, 0, 0, Math.round(MARK_OPACITY * 255)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      },
    ])
    .extend({
      right: margin,
      bottom: margin,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const stamped = base.composite([{ input: mark, gravity: "southeast" }]);
  if (/png$/i.test(mime))
    return { data: await stamped.png().toBuffer(), contentType: "image/png", ext: ".png" };
  if (/(webp|avif)$/i.test(mime))
    return { data: await stamped.webp({ quality: 88 }).toBuffer(), contentType: "image/webp", ext: ".webp" };
  return { data: await stamped.jpeg({ quality: 88 }).toBuffer(), contentType: "image/jpeg", ext: ".jpg" };
}

// ── collect candidate photo URLs from listings ──
const listings = await prisma.listing.findMany({
  select: { id: true, photos: true },
});
const urls = new Set();
for (const l of listings)
  for (const u of l.photos)
    if (u.startsWith(`${PUBLIC_URL}/listings/`)) urls.add(u);

console.log(`${listings.length} listings, ${urls.size} unique R2 listing photos`);

const remap = new Map(); // old URL -> new URL
let skippedNew = 0, skippedWm = 0, skippedType = 0, failed = 0;

for (const url of urls) {
  const key = decodeURIComponent(url.slice(PUBLIC_URL.length + 1));
  if (/-wm\.[a-z0-9]+$/i.test(key)) { skippedWm++; continue; }

  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    console.warn(`  ! missing object: ${key}`);
    failed++;
    continue;
  }
  if (head.LastModified >= CUTOFF) { skippedNew++; continue; }

  const mime = head.ContentType ?? "application/octet-stream";
  if (!WATERMARKABLE.test(mime)) { skippedType++; continue; }

  if (!APPLY) {
    remap.set(url, "(would watermark)");
    continue;
  }

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = Buffer.from(await obj.Body.transformToByteArray());
    const marked = await watermark(bytes, mime);
    if (!marked) { failed++; continue; }
    const newKey = key.replace(/\.[a-z0-9]+$/i, "") + `-wm${marked.ext}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: newKey,
        Body: marked.data,
        ContentType: marked.contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    remap.set(url, `${PUBLIC_URL}/${newKey}`);
  } catch (e) {
    console.warn(`  ! failed: ${key}: ${e.message}`);
    failed++;
  }
}

console.log(
  `candidates: ${remap.size} · already marked (new): ${skippedNew} · -wm keys: ${skippedWm} · non-watermarkable: ${skippedType} · failed: ${failed}`,
);

if (APPLY && remap.size) {
  let updated = 0;
  for (const l of listings) {
    const next = l.photos.map((u) => remap.get(u) ?? u);
    if (next.some((u, i) => u !== l.photos[i])) {
      await prisma.listing.update({ where: { id: l.id }, data: { photos: next } });
      updated++;
    }
  }
  console.log(`updated ${updated} listings to watermarked photo URLs`);
} else if (!APPLY) {
  console.log("dry run only — re-run with --apply to write");
}

await prisma.$disconnect();
