import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import {
  R2_BUCKET,
  isR2Configured,
  publicUrlFor,
  r2Client,
} from "@/lib/r2";
import { fetchPublicUrl } from "@/lib/ssrf";

// Turns an already-stored photo a quarter turn and saves the result as a NEW
// R2 object, returning its URL. Stored photos are immutable (they're served
// with a one-year immutable cache header), so rotating writes a new key rather
// than overwriting the old one.
//
// A photo the browser still holds as a File is rotated locally instead, before
// it is ever uploaded — see rotateImageFile in PhotoUploader. This route covers
// the photos we only have a URL for: a pasted-URL import in the Sell wizard, or
// a photo already saved on a listing being edited. The bucket is a different
// origin, so a canvas in the browser would be tainted and refuse to hand the
// rotated bytes back.
//
// The BX watermark is already baked into these pixels and turns with the photo
// (it can't be un-stamped, and stamping again would leave two marks). An
// upright photo with its logo in a different corner still beats a sideways one.

const MAX_BYTES = 10 * 1024 * 1024; // match /api/upload
// No GIF: re-encoding one here would flatten the animation, and /api/upload
// and /api/photo-import deliberately store GIFs untouched for that reason.
const ROTATABLE = /^image\/(png|jpe?g|webp|avif)/i;

export async function POST(req: Request) {
  const limited = rateLimit(req, "photo-rotate", 40, 60_000);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Image storage is not configured (R2 env vars missing)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.url === "string" ? body.url.trim() : "";
  // Right angles only: sharp rearranges whole pixels for those, so a turn
  // costs nothing in quality beyond the one re-encode, and no background has
  // to be invented for the corners.
  const requested = Number(body?.degrees ?? 90);
  const degrees = Number.isFinite(requested)
    ? ((Math.trunc(requested) % 360) + 360) % 360
    : NaN;
  if (degrees !== 90 && degrees !== 180 && degrees !== 270) {
    return NextResponse.json(
      { error: "Photos can only be turned by 90, 180 or 270 degrees." },
      { status: 400 },
    );
  }

  // fetchPublicUrl re-validates every redirect hop (host + DNS), so a public
  // URL can't 302 the fetch onto an internal address.
  let res: Response;
  try {
    res = await fetchPublicUrl(raw, {
      headers: { "User-Agent": "Mozilla/5.0 (BeanieXchange photo rotate)" },
    });
  } catch {
    return NextResponse.json(
      { error: "Only public, reachable http(s) image URLs can be rotated." },
      { status: 400 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: `The image host responded with ${res.status}.` },
      { status: 502 },
    );
  }

  const mime = (res.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!ROTATABLE.test(mime)) {
    return NextResponse.json(
      {
        error: /gif/i.test(mime)
          ? "Animated GIFs can't be rotated — remove it and add a still photo."
          : "That photo isn't an image we can rotate.",
      },
      { status: 415 },
    );
  }

  const source = new Uint8Array(await res.arrayBuffer());
  if (source.byteLength === 0) {
    return NextResponse.json({ error: "That photo was empty." }, { status: 502 });
  }
  if (source.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "That photo is over 10 MB." },
      { status: 413 },
    );
  }

  // Keep the stored format (matching how watermarkImage re-encodes), so a
  // rotate doesn't quietly turn a PNG into a JPEG and drop its transparency.
  // autoOrient() first: a photo that still carries an EXIF orientation tag
  // must be turned from what the viewer sees, not from its raw pixel order.
  let rotated: Buffer;
  let contentType: string;
  let ext: string;
  try {
    const turned = sharp(Buffer.from(source)).autoOrient().rotate(degrees);
    if (/png$/i.test(mime)) {
      rotated = await turned.png().toBuffer();
      contentType = "image/png";
      ext = ".png";
    } else if (/(webp|avif)$/i.test(mime)) {
      // AVIF re-encoding is very slow; WebP keeps alpha and stays fast.
      rotated = await turned.webp({ quality: 88 }).toBuffer();
      contentType = "image/webp";
      ext = ".webp";
    } else {
      rotated = await turned.jpeg({ quality: 90 }).toBuffer();
      contentType = "image/jpeg";
      ext = ".jpg";
    }
  } catch {
    return NextResponse.json(
      { error: "Couldn't rotate that photo." },
      { status: 500 },
    );
  }

  const key = `listings/${session.user.id}/rot-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}${ext}`;

  await r2Client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: rotated,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return NextResponse.json({ url: publicUrlFor(key) });
}
