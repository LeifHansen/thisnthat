import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { R2_BUCKET, isR2Configured, publicUrlFor, r2Client } from "@/lib/r2";

// AI hero-image agent for the blog generator (admin only, same gate as
// /api/blog-generate). Two steps: gpt-4o-mini acts as art director and turns
// the drafted article's title/excerpt into a single tailored image prompt,
// then the image model renders a landscape hero which is stored in R2. The
// admin still reviews it in the generator before publishing — the returned
// URL just fills the existing cover-image field.

const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY;
// gpt-image-1 is the current model; override if the account lacks access
// (e.g. to "dall-e-3"). Both are handled below (b64 or url response).
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

// Landscape hero to suit the 16:9 blog cards/headers; each model has its own
// supported landscape size.
function heroSize(model: string): string {
  if (model.startsWith("gpt-image")) return "1536x1024";
  if (model === "dall-e-3") return "1792x1024";
  return "1024x1024";
}

const ART_DIRECTOR_PROMPT = `You are the art director for BeanieXchange (BX), the marketplace and community for authenticated Ty Beanie Babies. Given a blog article's title and summary, write ONE image-generation prompt for its hero image.

Rules for the prompt you write:
- Describe a warm, editorial illustration or styled photo scene evoking the article's topic — plush bean-filled toys, collecting, tags, displays. Nostalgic, collector-friendly, light and clean; suits a white-background blog with red accents.
- Concrete visual details only (subject, composition, lighting, palette). Never mention Ty, brand names, or real people.
- The image must contain NO text, letters, logos, or watermarks — say so in the prompt.
- One paragraph, under 90 words.

Respond ONLY with a JSON object: { "prompt": string }`;

/** Deterministic fallback so a hiccup in the art-director step never blocks
 *  the image itself. */
function fallbackPrompt(title: string): string {
  return (
    `A warm editorial illustration for a collectors' blog article titled "${title}": ` +
    `soft plush bean-filled animal toys arranged on a clean, bright surface with gentle ` +
    `studio lighting, subtle red accents, nostalgic and friendly mood. ` +
    `No text, no letters, no logos, no watermarks.`
  );
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "blog-hero-image", 6, 60_000);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
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
  const str = (v: unknown, n: number) =>
    typeof v === "string" ? v.trim().slice(0, n) : "";
  const title = str(body?.title, 200);
  const excerpt = str(body?.excerpt, 320);
  const instructions = str(body?.instructions, 300);
  if (title.length < 4) {
    return NextResponse.json(
      { error: "Generate the article first — the hero image is based on it." },
      { status: 400 },
    );
  }

  // --- Step 1: art-director agent writes the image prompt (best-effort) ---
  let prompt = fallbackPrompt(title);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 300,
        temperature: 0.8,
        messages: [
          { role: "system", content: ART_DIRECTOR_PROMPT },
          {
            role: "user",
            content: [
              `Article title: ${title}`,
              excerpt ? `Article summary: ${excerpt}` : "",
              instructions ? `Editor's art direction: ${instructions}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const raw = data?.choices?.[0]?.message?.content;
      const crafted = str(JSON.parse(raw)?.prompt, 800);
      if (crafted.length > 40) prompt = crafted;
    }
  } catch {
    // fall through with the fallback prompt
  }

  // --- Step 2: render the hero ---
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
        size: heroSize(IMAGE_MODEL),
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

  // --- Store in R2 ---
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const objectKey = `blog/hero-${slug || "post"}-${Date.now()}.png`;
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

  return NextResponse.json({ url: publicUrlFor(objectKey), prompt });
}
