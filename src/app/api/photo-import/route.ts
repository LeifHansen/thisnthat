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

// Imports a pasted image URL into our own R2 storage and returns the R2 URL.
//
// Hotlinking pasted URLs directly is unreliable: many hosts (notably Google's
// encrypted-tbn thumbnails) serve the image to a server fetch but block
// browsers that send a cross-site Referer — the photo "saves" but renders
// broken everywhere on the site. Importing a copy at paste time makes the
// photo permanent and referer-proof.

const MAX_BYTES = 10 * 1024 * 1024; // match /api/upload
const ALLOWED_MIME = /^image\/(png|jpe?g|webp|gif|avif)/i;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export async function POST(req: Request) {
  const limited = rateLimit(req, "photo-import", 20, 60_000);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Image import is not configured (R2 env vars missing)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.url === "string" ? body.url.trim() : "";

  // fetchPublicUrl re-validates every redirect hop (host + DNS), so a public
  // URL can't 302 the fetch onto an internal address.
  let res: Response;
  try {
    res = await fetchPublicUrl(raw, {
      headers: { "User-Agent": "Mozilla/5.0 (thisnthat image import)" },
    });
  } catch {
    return NextResponse.json(
      { error: "Only public, reachable http(s) image URLs can be imported." },
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
      {
        error:
          "That link isn't a direct image (PNG, JPG, WebP, GIF, or AVIF). " +
          "Right-click the image itself and copy its address, or save and upload the file.",
      },
      { status: 415 },
    );
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength === 0) {
    return NextResponse.json({ error: "The image was empty." }, { status: 502 });
  }
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "That image is over 10 MB." },
      { status: 413 },
    );
  }

  // Stamp the This'n'that mark; fall back to the original bytes (GIFs,
  // undecodable files, or a missing watermark asset) rather than failing
  // the import.
  const marked = await watermarkImage(buf, mime);
  const ext = marked?.ext ?? EXT_BY_MIME[mime] ?? ".img";
  const key = `listings/${session.user.id}/import-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}${ext}`;

  await r2Client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: marked?.data ?? buf,
      ContentType: marked?.contentType ?? mime,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return NextResponse.json({ url: publicUrlFor(key) });
}
