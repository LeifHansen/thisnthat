import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { isSuperadmin } from "@/lib/guards";
import { rateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/db";
import { beaniePhotoKey } from "@/lib/photos";
import { resolveBeanie } from "@/lib/beanie-id";
import { R2_BUCKET, isR2Configured, publicUrlFor, r2Client } from "@/lib/r2";

// Superadmin-only: generate an AI PLACEHOLDER image for a catalogue beanie
// that has no real marketplace photo, and store it (R2 + BeanieImage row) so
// the /database page can show it. These are clearly reference placeholders —
// generated illustrations of the plush, never presented as real product
// photos of a specific item for sale.

const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY;
// gpt-image-1 is the current model; override if the account lacks access
// (e.g. to "dall-e-3"). Both are handled below (b64 or url response).
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

export async function POST(req: Request) {
  const limited = rateLimit(req, "beanie-image-gen", 20, 60_000);
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
  if (!OPENAI_KEY) {
    return NextResponse.json(
      { error: "AI image generation is not configured (OPENAI_API_KEY missing)." },
      { status: 503 },
    );
  }
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Image storage is not configured (R2 env vars missing)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const name = (typeof body?.name === "string" ? body.name : "").trim().slice(0, 120);
  const key = beaniePhotoKey(name);
  if (!name || !key) {
    return NextResponse.json({ error: "Missing beanie name." }, { status: 400 });
  }

  // Ground the prompt in catalogue facts (animal, etc.) when we can resolve it.
  const entry = resolveBeanie(name);
  const animal = entry?.animal ? entry.animal.toLowerCase() : "plush animal";
  const prompt =
    `A clean studio product photo of a Ty Beanie Baby style plush ${animal} toy named "${entry?.name ?? name}", ` +
    `centered on a plain white background with a soft shadow. Small stuffed bean-filled plush toy, ` +
    `soft fabric, friendly, collectible. Catalogue reference image, no text, no watermark, no packaging.`;

  // --- Generate ---
  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        size: "1024x1024",
      }),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut
          ? "Image generation took too long. Try again."
          : "Could not reach the image service. Try again.",
      },
      { status: timedOut ? 504 : 502 },
    );
  }
  if (!aiRes.ok) {
    const detail = await aiRes.text().catch(() => "");
    // Surface the model-access hint so the admin knows to set OPENAI_IMAGE_MODEL.
    return NextResponse.json(
      {
        error: `Image generation failed (${aiRes.status}).${
          aiRes.status === 403 || aiRes.status === 400
            ? ` Your OpenAI account may not have access to "${IMAGE_MODEL}" — set OPENAI_IMAGE_MODEL (e.g. dall-e-3).`
            : ""
        }`,
        detail: detail.slice(0, 300),
      },
      { status: 502 },
    );
  }

  const data = await aiRes.json().catch(() => null);
  const item = data?.data?.[0];
  let png: Buffer | null = null;
  if (item?.b64_json) {
    png = Buffer.from(item.b64_json, "base64");
  } else if (item?.url) {
    // dall-e-3 default response is a URL; fetch the bytes.
    const imgRes = await fetch(item.url, {
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (imgRes?.ok) png = Buffer.from(await imgRes.arrayBuffer());
  }
  if (!png || png.byteLength === 0) {
    return NextResponse.json(
      { error: "No image was produced. Try again." },
      { status: 502 },
    );
  }

  // --- Store in R2 + record the row (upsert by normalized key) ---
  const objectKey = `catalogue/${key}-${Date.now()}.png`;
  try {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
        Body: png,
        ContentType: "image/png",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "Couldn't store the generated image. Try again." },
      { status: 502 },
    );
  }
  const url = publicUrlFor(objectKey);

  const canonicalName = entry?.name ?? name;
  await prisma.beanieImage.upsert({
    where: { normalizedKey: key },
    update: { url, name: canonicalName, source: "ai" },
    create: { normalizedKey: key, name: canonicalName, url, source: "ai" },
  });

  return NextResponse.json({ url, key });
}
