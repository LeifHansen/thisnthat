import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { isSuperadmin } from "@/lib/guards";
import { rateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/db";
import { beaniePhotoKey } from "@/lib/photos";
import { resolveBeanie } from "@/lib/beanie-id";
import { CATEGORIES } from "@/lib/beanie-database";
import { beanieSlug } from "@/lib/image-seo";
import { R2_BUCKET, isR2Configured, publicUrlFor, r2Client } from "@/lib/r2";

// Superadmin-only: edit a catalogue "line item" on /database — its fields
// (name, animal, category, year, style #, value, note) and/or its reference
// photo — without shipping a code change or creating a listing.
//
//   • Field edits are stored in BeanieOverride (only values that differ from
//     the static catalogue default are persisted; the file stays the source of
//     truth for everything else).
//   • Photos are stored in BeanieImage (source="manual"): an uploaded file is
//     optimized to WebP and put in R2, or a pasted URL is stored as-is.
//   • action=reset clears the field overrides (reverts to the catalogue).
//
// The /database page merges both on top of the static entry at render time.

const IMAGE_MIME = /^image\/(png|jpe?g|webp|avif|gif)$/i;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Parse an integer field; blank/invalid → null (no override). */
function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (!s) return null;
  const n = Number.parseInt(s.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Keep an override only when it actually differs from the catalogue default. */
function overrideOrNull<T>(value: T | null, base: T | null | undefined): T | null {
  if (value == null || value === "") return null;
  return value === (base ?? null) ? null : value;
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "beanie-entry-edit", 40, 60_000);
  if (limited) return limited;

  const session = await auth();
  // Email match alone isn't enough — the account must actually hold the
  // ADMIN role, mirroring requireSuperadmin() on the page side.
  if (
    !session?.user ||
    session.user.role !== "ADMIN" ||
    !isSuperadmin(session.user)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const originalName = str(form.get("originalName"));
  const key = beaniePhotoKey(originalName);
  if (!originalName || !key) {
    return NextResponse.json({ error: "Missing beanie name." }, { status: 400 });
  }
  const base = resolveBeanie(originalName);
  const action = str(form.get("action")) || "save";

  // --- Reset: drop the field overrides, revert to the catalogue defaults. ---
  if (action === "reset") {
    await prisma.beanieOverride.deleteMany({ where: { normalizedKey: key } });
    return NextResponse.json({ ok: true, reset: true, key });
  }

  // --- Save: validate + persist field overrides. ---
  const name = str(form.get("name"));
  const animal = str(form.get("animal"));
  const category = str(form.get("category"));
  const styleNumber = str(form.get("styleNumber"));
  const note = str(form.get("note"));
  const year = intOrNull(form.get("year"));
  const valueLow = intOrNull(form.get("valueLow"));
  const valueHigh = intOrNull(form.get("valueHigh"));

  if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json(
      { error: `Unknown category "${category}".` },
      { status: 400 },
    );
  }
  if (valueLow != null && valueHigh != null && valueLow > valueHigh) {
    return NextResponse.json(
      { error: "Low value can't be greater than high value." },
      { status: 400 },
    );
  }

  const data = {
    name: overrideOrNull(name, base?.name ?? null),
    animal: overrideOrNull(animal, base?.animal ?? null),
    category: overrideOrNull(category, base?.category ?? null),
    styleNumber: overrideOrNull(styleNumber, base?.styleNumber ?? null),
    note: overrideOrNull(note, base?.note ?? null),
    year: overrideOrNull(year, base?.year ?? null),
    valueLow: overrideOrNull(valueLow, base?.valueLow ?? null),
    valueHigh: overrideOrNull(valueHigh, base?.valueHigh ?? null),
  };
  const hasFieldOverride = Object.values(data).some((v) => v != null);

  // The name that should label the stored photo — the effective (edited) name.
  const effectiveName = name || base?.name || originalName;

  // --- Photo handling. ---
  const imageMode = str(form.get("imageMode")) || "keep";
  let imageUrl: string | null | undefined; // undefined = unchanged

  if (imageMode === "remove") {
    await prisma.beanieImage.deleteMany({ where: { normalizedKey: key } });
    imageUrl = null;
  } else if (imageMode === "url") {
    const raw = str(form.get("imageUrl"));
    // Accept an absolute http(s) URL or a site-relative path (e.g. /beanie-images/x.webp).
    if (!/^https?:\/\//i.test(raw) && !raw.startsWith("/")) {
      return NextResponse.json(
        { error: "Enter a full https:// URL or a site path starting with /." },
        { status: 400 },
      );
    }
    await prisma.beanieImage.upsert({
      where: { normalizedKey: key },
      update: { url: raw, name: effectiveName, source: "manual" },
      create: { normalizedKey: key, name: effectiveName, url: raw, source: "manual" },
    });
    imageUrl = raw;
  } else if (imageMode === "upload") {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }
    if (!IMAGE_MIME.test(file.type)) {
      return NextResponse.json(
        { error: `Unsupported image type: ${file.type || "unknown"}.` },
        { status: 415 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image is over 10 MB." }, { status: 413 });
    }
    if (!isR2Configured()) {
      return NextResponse.json(
        {
          error:
            "Image upload isn't configured on this server (R2 env vars missing). Paste an image URL instead.",
        },
        { status: 503 },
      );
    }
    // Optimize to a small WebP so catalogue images stay light.
    let webp: Buffer;
    try {
      webp = await sharp(Buffer.from(await file.arrayBuffer()))
        .resize({ width: 800, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      return NextResponse.json(
        { error: "Couldn't process that image. Try a different file." },
        { status: 422 },
      );
    }
    // SEO-friendly object name (keyword-rich, not a random string).
    const objectKey = `catalogue/${beanieSlug(effectiveName)}-${key}.webp`;
    try {
      await r2Client().send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: objectKey,
          Body: webp,
          ContentType: "image/webp",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    } catch {
      return NextResponse.json(
        { error: "Couldn't store the image. Try again." },
        { status: 502 },
      );
    }
    // Cache-bust callers by appending a version when the object key is stable.
    const url = publicUrlFor(objectKey);
    await prisma.beanieImage.upsert({
      where: { normalizedKey: key },
      update: { url, name: effectiveName, source: "manual" },
      create: { normalizedKey: key, name: effectiveName, url, source: "manual" },
    });
    imageUrl = url;
  }

  // Persist field overrides (or clear the row when nothing differs from base).
  if (hasFieldOverride) {
    await prisma.beanieOverride.upsert({
      where: { normalizedKey: key },
      update: data,
      create: { normalizedKey: key, ...data },
    });
  } else {
    await prisma.beanieOverride.deleteMany({ where: { normalizedKey: key } });
  }

  // Return the effective (merged) row so the client can update in place.
  const merged = {
    name: effectiveName,
    animal: animal || base?.animal || "",
    category: category || base?.category || "",
    year: year ?? base?.year ?? null,
    styleNumber: styleNumber || base?.styleNumber || null,
    valueLow: valueLow ?? base?.valueLow ?? null,
    valueHigh: valueHigh ?? base?.valueHigh ?? null,
    note: note || base?.note || null,
  };
  return NextResponse.json({ ok: true, key, entry: merged, imageUrl });
}
