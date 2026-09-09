import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import {
  R2_BUCKET,
  isR2Configured,
  publicUrlFor,
  r2Client,
} from "@/lib/r2";
import { fetchPublicUrl } from "@/lib/ssrf";
import { watermarkImage } from "@/lib/watermark";
import {
  StudioError,
  autoEnhance,
  isBackgroundRemovalConfigured,
  removeBackground,
  studioComposite,
} from "@/lib/studio";

// Studio image optimizer. Takes ONE already-uploaded listing photo and returns
// a new R2 URL for a "photo studio" version of it: the item cut out from its
// background, centered on a soft light sweep, with a drop shadow.
//
// The item's own pixels are preserved (segmentation, not generation) so the
// studio shot still honestly shows what the buyer will receive. The seller
// opts in per listing via the "Studio-optimize photos" checkbox.

const MAX_BYTES = 10 * 1024 * 1024; // match /api/upload
const ALLOWED_MIME = /^image\/(png|jpe?g|webp|avif)/i; // no GIF: cutout needs a still

export async function POST(req: Request) {
  const limited = rateLimit(req, "listing-image-optimize", 20, 60_000);
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
  if (!isBackgroundRemovalConfigured()) {
    return NextResponse.json(
      { error: "Studio optimization isn't set up on this server." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.photoUrl === "string" ? body.photoUrl.trim() : "";
  // Fetch the source photo (usually one of our own R2 URLs). fetchPublicUrl
  // re-validates every redirect hop (host + DNS), so a public URL can't 302
  // the fetch onto an internal address.
  let res: Response;
  try {
    res = await fetchPublicUrl(raw, {
      headers: { "User-Agent": "Mozilla/5.0 (BeanieXchange studio optimize)" },
    });
  } catch {
    return NextResponse.json(
      { error: "Only public, reachable http(s) image URLs can be optimized." },
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
  if (!ALLOWED_MIME.test(mime)) {
    return NextResponse.json(
      { error: "That photo isn't a still image we can optimize." },
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

  // Cut out the item, then stage it as a studio product shot.
  let studioJpeg: Buffer;
  try {
    const enhanced = await autoEnhance(source, mime);
    const cutout = await removeBackground(enhanced.data, enhanced.mime);
    studioJpeg = await studioComposite(cutout);
  } catch (e) {
    if (e instanceof StudioError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "Couldn't optimize that photo. Try another." },
      { status: 500 },
    );
  }

  // Re-apply the BX watermark so the studio shot carries branding like every
  // other listing photo. Fall back to the un-marked studio JPEG if watermarking
  // fails rather than dropping the whole optimization.
  const marked = await watermarkImage(new Uint8Array(studioJpeg), "image/jpeg");
  const bodyBytes = marked?.data ?? studioJpeg;
  const contentType = marked?.contentType ?? "image/jpeg";
  const ext = marked?.ext ?? ".jpg";

  const key = `listings/${session.user.id}/studio-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}${ext}`;

  await r2Client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: bodyBytes,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return NextResponse.json({ url: publicUrlFor(key) });
}
