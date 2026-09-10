import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { currentUser } from "@/lib/currentUser";
import { rateLimit } from "@/lib/rateLimit";
import {
  R2_BUCKET,
  isR2Configured,
  publicUrlFor,
  r2Client,
} from "@/lib/r2";
import { watermarkImage } from "@/lib/watermark";
import {
  autoEnhance,
  isBackgroundRemovalConfigured,
  removeBackground,
  studioComposite,
} from "@/lib/studio";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 12;
const ALLOWED_MIME = /^image\/(png|jpe?g|webp|gif|avif)$/i;
// Both the auto-level pass and studio staging need a still image: re-encoding
// an animated GIF would flatten it to one frame, so GIFs skip both (and
// watermarkImage leaves them alone for the same reason).
const STILL_MIME = /^image\/(png|jpe?g|webp|avif)$/i;

export async function POST(req: Request) {
  const limited = rateLimit(req, "upload", 30, 60_000);
  if (limited) return limited;

  const user = await currentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      {
        error:
          "Image upload is not configured (R2 env vars missing). Paste an image URL instead.",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  // `kind=avatar` uploads a single profile photo: no watermark, stored
  // under avatars/ instead of listings/. `kind=blog` is an editorial hero
  // image: no watermark, stored under blog/. Default remains listing photos.
  const rawKind = form.get("kind");
  const kind =
    rawKind === "avatar" ? "avatar" : rawKind === "blog" ? "blog" : "listing";

  // `studio=1` on listing uploads: cut the item out of its background, stage
  // it on the studio backdrop with a drop shadow, THEN watermark — all in this
  // one pass, so the seller decides before anything is stored. Best-effort per
  // file: a failed optimization falls back to the plain photo, reported via
  // `studioApplied[]`/`studioNote` rather than failing the upload.
  const studioWanted = kind === "listing" && form.get("studio") === "1";
  const studioAvailable = studioWanted && isBackgroundRemovalConfigured();

  // Accept either single `file` or multiple `file` / `files` entries.
  const raw = [...form.getAll("file"), ...form.getAll("files")];
  const files = raw.filter((v): v is File => v instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }
  const maxFiles = kind === "listing" ? MAX_FILES : 1;
  if (files.length > maxFiles) {
    return NextResponse.json(
      { error: `Max ${maxFiles} file${maxFiles === 1 ? "" : "s"} at once` },
      { status: 400 },
    );
  }
  for (const f of files) {
    if (!ALLOWED_MIME.test(f.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${f.name}` },
        { status: 415 },
      );
    }
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `${f.name} is over 10 MB` },
        { status: 413 },
      );
    }
  }

  const client = r2Client();
  const ts = Date.now();
  const owner = user.id;

  const results = await Promise.all(
    files.map(async (file, i) => {
      // Annotated (rather than inferred as Uint8Array<ArrayBuffer>) so the
      // auto-levelled bytes can be assigned back without copying them again.
      let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
      let mime = file.type;
      let studioApplied = false;

      // Auto-level every listing photo, studio or not: sellers shoot items
      // indoors under a lamp, so the file that arrives is usually dim and
      // flat, and `normalize` stretches its tonal range back out. It has to be
      // its own pass — sharp composites before it normalises, so folding this
      // into the watermark pass below would level the photo against the
      // logo's own black and white pixels and come out darker than it went in.
      // Best-effort: autoEnhance hands back the input untouched if sharp can't
      // decode it. Avatars and blog heroes are left alone.
      if (kind === "listing" && STILL_MIME.test(mime)) {
        const levelled = await autoEnhance(bytes, mime);
        bytes = levelled.data;
        mime = levelled.mime;
      }

      if (studioAvailable && STILL_MIME.test(mime)) {
        try {
          // Already auto-levelled above — cut the item out and stage it.
          const cutout = await removeBackground(bytes, mime);
          bytes = new Uint8Array(await studioComposite(cutout));
          mime = "image/jpeg";
          studioApplied = true;
        } catch {
          // fall back to the plain photo; reported via studioApplied[]
        }
      }

      // Stamp the This'n'that mark on listing photos; avatars and blog heroes
      // stay unmarked. Fall back to the original bytes (GIFs, undecodable
      // files, or a missing watermark asset) rather than failing the upload.
      const marked =
        kind === "listing" ? await watermarkImage(bytes, mime) : null;
      const ext =
        marked?.ext ??
        (studioApplied
          ? ".jpg"
          : (file.name.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? ".bin"));
      const prefix = studioApplied ? "studio-" : "";
      const safe = `${prefix}${ts}-${i}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      const key = `${
        kind === "avatar" ? "avatars" : kind === "blog" ? "blog" : "listings"
      }/${owner}/${safe}`;

      await client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: marked?.data ?? bytes,
          ContentType: marked?.contentType ?? mime,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );

      return { url: publicUrlFor(key), studioApplied };
    }),
  );

  const studioNote = !studioWanted
    ? undefined
    : !isBackgroundRemovalConfigured()
      ? "Studio optimization isn't set up on this server — photos were uploaded as-is."
      : results.some((r) => !r.studioApplied)
        ? "Some photos couldn't be studio-optimized and were uploaded as-is."
        : undefined;

  return NextResponse.json({
    urls: results.map((r) => r.url),
    studioApplied: results.map((r) => r.studioApplied),
    ...(studioNote ? { studioNote } : {}),
  });
}
