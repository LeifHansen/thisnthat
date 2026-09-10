import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

// Formats we re-encode with a watermark. GIFs are excluded so animations
// survive; they're stored as-is.
const WATERMARKABLE = /^image\/(png|jpe?g|webp|avif)$/i;

const MARK_SCALE = 0.18; // logo width ≈ 18% of the image's short side
const MARK_OPACITY = 0.45;
const MARGIN_SCALE = 0.03;

// public/tnt-watermark.png: the This'n'that mark as a small PNG with an alpha
// channel (transparent background), so it can be faded and composited onto a
// photo without a box around it.
const LOGO_PATH = path.join(process.cwd(), "public", "tnt-watermark.png");

// Loaded once per process. A missing or unreadable file resolves to null
// rather than rejecting, and null is NOT cached: the file may appear later
// (a deploy that ships it after the process started) and one bad read must
// not disable watermarking until the next restart.
let logoPromise: Promise<Buffer | null> | null = null;
function logo(): Promise<Buffer | null> {
  logoPromise ??= fs.readFile(LOGO_PATH).catch(() => {
    logoPromise = null;
    return null;
  });
  return logoPromise;
}

export type WatermarkedImage = {
  data: Buffer;
  contentType: string;
  ext: string;
};

/**
 * Stamp the This'n'that mark (semi-transparent, bottom-right) onto an
 * uploaded image. Returns null when the format isn't watermarkable, the mark
 * image is missing or corrupt, or processing fails — callers then store the
 * original bytes unchanged, so watermarking is a best-effort no-op and never
 * blocks an upload.
 */
export async function watermarkImage(
  input: Uint8Array,
  mime: string,
): Promise<WatermarkedImage | null> {
  if (!WATERMARKABLE.test(mime)) return null;
  try {
    const logoBytes = await logo();
    if (!logoBytes || logoBytes.byteLength === 0) return null;

    // rotate() bakes in EXIF orientation so the corner we stamp is the corner
    // the viewer sees. min(w,h) is orientation-invariant.
    const base = sharp(Buffer.from(input)).rotate();
    const { width, height } = await base.metadata();
    if (!width || !height) return null;
    const short = Math.min(width, height);
    const markWidth = Math.max(24, Math.round(short * MARK_SCALE));
    const margin = Math.max(8, Math.round(short * MARGIN_SCALE));

    // Fade the logo by multiplying its alpha (dest-in against a tiled 1×1
    // pixel), then pad transparent margin so gravity placement keeps it off
    // the very edge. A corrupt PNG throws out of sharp here and lands in the
    // catch below, i.e. the photo is stored unmarked.
    const mark = await sharp(logoBytes)
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

    if (/png$/i.test(mime)) {
      return {
        data: await stamped.png().toBuffer(),
        contentType: "image/png",
        ext: ".png",
      };
    }
    if (/(webp|avif)$/i.test(mime)) {
      // AVIF re-encoding is very slow; WebP keeps alpha and stays fast.
      return {
        data: await stamped.webp({ quality: 88 }).toBuffer(),
        contentType: "image/webp",
        ext: ".webp",
      };
    }
    return {
      data: await stamped.jpeg({ quality: 88 }).toBuffer(),
      contentType: "image/jpeg",
      ext: ".jpg",
    };
  } catch {
    return null;
  }
}
