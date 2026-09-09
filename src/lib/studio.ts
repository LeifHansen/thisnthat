import sharp from "sharp";

/**
 * "Photo studio" image pipeline for listing photos.
 *
 * Two stages, deliberately kept separate:
 *   1. removeBackground() — cuts the item out of its background using a
 *      SEGMENTATION provider (remove.bg or a self-hosted endpoint). This
 *      preserves the item's real pixels; it never regenerates the item.
 *      That honesty matters on an authentication-first marketplace — a
 *      studio photo must still show the actual beanie the buyer receives.
 *   2. studioComposite() — takes the transparent cutout and stages it like a
 *      product shot: trimmed, centered on a soft light-sweep backdrop, with a
 *      blurred drop shadow. Pure local sharp work, no network.
 *
 * Provider selection (first configured wins):
 *   - REMOVE_BG_API_KEY        → remove.bg (https://www.remove.bg/api)
 *   - BG_REMOVAL_ENDPOINT      → generic: POST multipart `image`, expects a
 *                                PNG (with alpha) back. Works with a self-hosted
 *                                rembg server, a Worker, etc.
 * When neither is set the feature reports itself unconfigured and callers
 * degrade gracefully (503), matching how R2/OpenAI absence is handled.
 */

const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY;
const BG_REMOVAL_ENDPOINT = process.env.BG_REMOVAL_ENDPOINT;
const BG_REMOVAL_TOKEN = process.env.BG_REMOVAL_TOKEN;

/** True when a background-removal provider is configured. */
export function isBackgroundRemovalConfigured(): boolean {
  return Boolean(REMOVE_BG_API_KEY || BG_REMOVAL_ENDPOINT);
}

/** Raised for expected, user-facing failures (surfaced verbatim to the seller). */
export class StudioError extends Error {}

// A Blob from an exact copy of the bytes — sidesteps the ArrayBufferLike vs
// ArrayBuffer typing friction and any shared-buffer offset surprises.
function toBlob(bytes: Uint8Array, mime: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: mime });
}

/**
 * Auto brightness/contrast pass. Every listing photo runs through it at upload
 * (and the studio path runs it again before a cutout it didn't upload itself):
 * amateur phone photos are often dim or flat, and sharp's normalize stretches
 * the tonal range (1st–99th percentile) so the item is well-exposed.
 * Deliberately gentle — a collectibles marketplace needs honest color, not a
 * beautify filter, so this only corrects exposure, it doesn't recolor.
 * EXIF orientation is baked in so the rest of the pipeline sees it upright.
 * Best-effort: returns the original bytes unchanged if sharp can't decode.
 */
export async function autoEnhance(
  bytes: Uint8Array,
  mime: string,
): Promise<{ data: Uint8Array; mime: string }> {
  try {
    const img = sharp(Buffer.from(bytes)).rotate().normalize();
    const png = /png/i.test(mime);
    const out = png
      ? await img.png().toBuffer()
      : await img.jpeg({ quality: 92 }).toBuffer();
    return { data: new Uint8Array(out), mime: png ? "image/png" : "image/jpeg" };
  } catch {
    return { data: bytes, mime };
  }
}

/**
 * Remove the background from an image, returning a PNG cutout with an alpha
 * channel. Throws StudioError with a user-safe message on provider failure.
 */
export async function removeBackground(
  bytes: Uint8Array,
  mime: string,
): Promise<Buffer> {
  if (REMOVE_BG_API_KEY) {
    return removeBgRemoveDotBg(bytes, mime);
  }
  if (BG_REMOVAL_ENDPOINT) {
    return removeBgGenericEndpoint(bytes, mime);
  }
  throw new StudioError("Background removal is not configured on this server.");
}

async function removeBgRemoveDotBg(
  bytes: Uint8Array,
  mime: string,
): Promise<Buffer> {
  const form = new FormData();
  form.append("image_file", toBlob(bytes, mime), "photo");
  form.append("size", "auto");
  form.append("format", "png"); // keep alpha

  let res: Response;
  try {
    res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": REMOVE_BG_API_KEY as string },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new StudioError(
      e instanceof Error && e.name === "TimeoutError"
        ? "The image service took too long. Please try again."
        : "Could not reach the image service. Try again.",
    );
  }
  if (!res.ok) {
    // remove.bg returns 402 when out of credits, 400 for undecodable images.
    if (res.status === 402) {
      throw new StudioError("Studio optimization is temporarily unavailable.");
    }
    throw new StudioError("Couldn't isolate the item in this photo. Try another.");
  }
  return Buffer.from(await res.arrayBuffer());
}

async function removeBgGenericEndpoint(
  bytes: Uint8Array,
  mime: string,
): Promise<Buffer> {
  const form = new FormData();
  form.append("image", toBlob(bytes, mime), "photo");

  let res: Response;
  try {
    res = await fetch(BG_REMOVAL_ENDPOINT as string, {
      method: "POST",
      headers: BG_REMOVAL_TOKEN
        ? { Authorization: `Bearer ${BG_REMOVAL_TOKEN}` }
        : undefined,
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new StudioError(
      e instanceof Error && e.name === "TimeoutError"
        ? "The image service took too long. Please try again."
        : "Could not reach the image service. Try again.",
    );
  }
  if (!res.ok) {
    throw new StudioError("Couldn't isolate the item in this photo. Try another.");
  }
  return Buffer.from(await res.arrayBuffer());
}

// --- Studio staging (local, deterministic) --------------------------------

const CANVAS = 1200; // square output, big enough to look crisp in the gallery
const SUBJECT_MAX = Math.round(CANVAS * 0.7); // leave a margin around the item
const SHADOW_ALPHA = 0.2; // peak opacity of the drop shadow (kept light/subtle)
const SHADOW_BLUR = Math.round(CANVAS * 0.038); // softer, more diffuse shadow
const SHADOW_DX = Math.round(CANVAS * 0.01); // shadow nudged right…
const SHADOW_DY = Math.round(CANVAS * 0.026); // …and down, as if lit from above
// Feather the cutout's alpha edge so the hard segmentation boundary blends
// into the backdrop instead of looking cut-out with a crisp outline.
const EDGE_FEATHER = Math.max(1, Math.round(CANVAS * 0.0015));

// Brilliant-white photographer's sweep: pure white across the whole subject
// area, easing to the faintest cool grey only in the far corners so the frame
// still has depth without ever reading as dingy or cream. Rasterized from SVG
// so there are no banding artifacts.
const BACKDROP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}">
  <defs>
    <radialGradient id="sweep" cx="50%" cy="42%" r="78%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="72%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f7f8fa"/>
    </radialGradient>
  </defs>
  <rect width="${CANVAS}" height="${CANVAS}" fill="url(#sweep)"/>
</svg>`;

// The backdrop is a constant — rasterize it once per process, not per photo.
// A rejection is NOT cached: caching it would leave every later studio
// upload failing on one transient sharp error until the process restarts.
let backdropPromise: Promise<Buffer> | null = null;
function rasterizedBackdrop(): Promise<Buffer> {
  backdropPromise ??= sharp(Buffer.from(BACKDROP_SVG))
    .png()
    .toBuffer()
    .catch((e) => {
      backdropPromise = null;
      throw e;
    });
  return backdropPromise;
}

const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));

/**
 * Stage a transparent PNG cutout as a studio product shot: trimmed, centered
 * on the light sweep, with a soft drop shadow. Returns an opaque JPEG buffer.
 */
export async function studioComposite(cutoutPng: Buffer): Promise<Buffer> {
  // Trim the transparent border so the item is measured, not its padding, then
  // scale it to sit comfortably inside the frame.
  const trimmed = await sharp(cutoutPng)
    .ensureAlpha()
    .trim()
    .resize({
      width: SUBJECT_MAX,
      height: SUBJECT_MAX,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  const meta = await sharp(trimmed).metadata();
  const sw = meta.width ?? SUBJECT_MAX;
  const sh = meta.height ?? SUBJECT_MAX;

  // Soften the cutout edge: blur ONLY the alpha channel (a "feather"), so the
  // item's colors stay sharp but its outline melts gently into the backdrop.
  const { data: rgba } = await sharp(trimmed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const featheredAlpha = await sharp(trimmed)
    .ensureAlpha()
    .extractChannel(3)
    .blur(EDGE_FEATHER)
    .raw()
    .toBuffer();
  for (let i = 0; i < sw * sh; i++) rgba[i * 4 + 3] = featheredAlpha[i];
  const subject = await sharp(rgba, {
    raw: { width: sw, height: sh, channels: 4 },
  })
    .png()
    .toBuffer();

  // Center the subject, biased slightly up so the shadow reads below it.
  const left = clamp(Math.round((CANVAS - sw) / 2), CANVAS - sw);
  const top = clamp(
    Math.round((CANVAS - sh) / 2) - Math.round(CANVAS * 0.02),
    CANVAS - sh,
  );

  // Build the shadow from the subject's own silhouette (its alpha channel):
  // black where the item is, transparent elsewhere, faded to SHADOW_ALPHA.
  const { data: alpha } = await sharp(subject)
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const silhouette = Buffer.alloc(sw * sh * 4, 0);
  for (let i = 0; i < sw * sh; i++) {
    silhouette[i * 4 + 3] = Math.round(alpha[i] * SHADOW_ALPHA);
  }

  // Lay the silhouette onto a full-canvas layer (offset down-right) BEFORE
  // blurring, so the blur has room to feather instead of clipping at an edge.
  const shadowLayer = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: silhouette,
        raw: { width: sw, height: sh, channels: 4 },
        left: clamp(left + SHADOW_DX, CANVAS - sw),
        top: clamp(top + SHADOW_DY, CANVAS - sh),
      },
    ])
    .blur(Math.max(4, SHADOW_BLUR))
    .png()
    .toBuffer();

  const backdrop = await rasterizedBackdrop();

  return sharp(backdrop)
    .composite([
      { input: shadowLayer, left: 0, top: 0 },
      { input: subject, left, top },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}
