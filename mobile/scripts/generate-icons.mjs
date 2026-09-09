/**
 * Regenerates the app's launcher art from the web app's brand mark.
 *
 * The Expo template ships its own logo for every one of these, which is how
 * this app spent its first six commits with the Expo symbol as its home-screen
 * icon. Deriving them from `public/brand/` instead keeps the app and the site
 * on one mark, and makes a brand refresh a one-command re-run.
 *
 * Run from the repo root (it borrows the web app's `sharp`):
 *   node mobile/scripts/generate-icons.mjs
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sharp = require(path.join(root, "node_modules/sharp"));

const SOURCE = path.join(root, "public/brand/bx-heart-logo-v3.png");
const OUT = path.join(root, "mobile/assets/images");

// --bx-bg, mirrored in mobile/src/constants/theme.ts as Brand.cream.
const CREAM = { r: 0xfa, g: 0xf5, b: 0xec, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** The mark with its transparent margin cropped off, scaled to fit `box`. */
async function scaledMark(box) {
  const trimmed = await sharp(SOURCE).trim({ threshold: 1 }).toBuffer();
  return sharp(trimmed).resize(box, box, { fit: "inside", kernel: "lanczos3" }).toBuffer();
}

/**
 * Compose the mark onto a `size` square, centred, covering `coverage` of the
 * edge. The source carries a generous transparent margin and is wider than it
 * is tall, so it has to be trimmed first or the mark ends up floating small and
 * high in the frame.
 *
 * `opaque` drops the alpha channel entirely: App Store Connect rejects an app
 * icon that has one, even when every pixel in it is fully opaque.
 */
async function compose({ size, coverage, background, out, opaque = false }) {
  let canvas = sharp({
    create: { width: size, height: size, channels: 4, background },
  });
  if (coverage > 0) {
    canvas = canvas.composite([{ input: await scaledMark(Math.round(size * coverage)) }]);
    // A composite resets the pipeline, so re-open the result to keep going.
    canvas = sharp(await canvas.png().toBuffer());
  }
  if (opaque) canvas = canvas.flatten({ background }).removeAlpha();
  await canvas.png().toFile(path.join(OUT, out));
  return out;
}

/** Android themed icon: the mark's silhouette, which the system tints itself. */
async function monochrome({ size, coverage, out }) {
  const mark = await scaledMark(Math.round(size * coverage));
  const alpha = await sharp(mark).ensureAlpha().extractChannel("alpha").toBuffer();
  const { width, height } = await sharp(alpha).metadata();
  const silhouette = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: TRANSPARENT },
  })
    .composite([{ input: silhouette, gravity: "centre" }])
    .png()
    .toFile(path.join(OUT, out));
  return out;
}

const written = [];

// iOS/App Store master. iOS applies its own corner mask, so no rounding here.
written.push(
  await compose({ size: 1024, coverage: 0.74, background: CREAM, out: "icon.png", opaque: true }),
);

// Splash mark. Transparent; app.json sizes it and paints the backdrop.
written.push(
  await compose({ size: 512, coverage: 0.92, background: TRANSPARENT, out: "splash-icon.png" }),
);

// Android adaptive icon. The launcher masks to the centre ~66%, so the
// foreground stays well inside that safe zone.
written.push(
  await compose({
    size: 432,
    coverage: 0.6,
    background: TRANSPARENT,
    out: "android-icon-foreground.png",
  }),
);
written.push(
  await compose({ size: 432, coverage: 0, background: CREAM, out: "android-icon-background.png" }),
);
written.push(await monochrome({ size: 432, coverage: 0.6, out: "android-icon-monochrome.png" }));

// Expo web favicon.
written.push(await compose({ size: 196, coverage: 0.88, background: CREAM, out: "favicon.png" }));

console.log(`Wrote ${written.length} icons to mobile/assets/images:`);
for (const f of written) console.log(`  ${f}`);
