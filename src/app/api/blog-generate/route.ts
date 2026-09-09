import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { fetchPublicUrl } from "@/lib/ssrf";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// AI blog generator (superadmin only). Given a reference article URL — and an
// optional cover image URL plus angle/instructions — it fetches the article,
// strips it to readable text, and asks the model to WRITE or REWRITE it into an
// original, on-brand blog post for the marketplace. Returns a structured draft the
// admin reviews and edits before publishing. Nothing is persisted here; saving
// is a separate server action (src/lib/blog.ts).

const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY;

const SYSTEM_PROMPT = `You are the editorial writer for ${SITE_NAME} — an online resale marketplace where anyone can list what they have (clothing, shoes, accessories, collectibles, trading cards, art, home decor, pottery and glass, electronics, books and media, toys and games) and sell it to the public. Posts are bylined "${SITE_NAME} Team".

You are given the text of a REFERENCE article and a mode. Produce an ORIGINAL blog post for the ${SITE_NAME} blog.

Modes:
- "rewrite": Rewrite the reference article in ${SITE_NAME}'s voice — same core facts and topic, restructured and reworded into fresh, original prose. Do NOT copy sentences verbatim. Improve clarity and flow.
- "fresh": Use the reference only as inspiration/source material and write a new article on the same subject from ${SITE_NAME}'s perspective.

Voice & rules:
- Warm, practical, knowledgeable. Helpful, never hypey. No emoji. No ALL CAPS.
- Write for people who buy and sell secondhand: thrifters, vintage hunters, collectors, and anyone clearing out a closet. Where natural and TRUE, relate the topic to pricing, photographing, describing, shipping, or shopping for pre-owned items — but never fabricate facts, prices, or claims not supported by the reference.
- Do not invent quotes, statistics, or sources. If the reference lacks a detail, omit it.
- Never include affiliate junk, "click here", or the reference site's own navigation/boilerplate.

Output format:
- "title": a compelling, specific headline (<= 90 chars).
- "excerpt": a 1-2 sentence summary (<= 280 chars) for cards and meta descriptions.
- "content": the full article body in MARKDOWN. Use "##" and "###" for section headings (do NOT include an H1 — the title is rendered separately), short paragraphs, and "- " bullet lists where helpful. 400-900 words.

Respond ONLY with a JSON object: { "title": string, "excerpt": string, "content": string }`;

/** Very small HTML → text extractor: drop scripts/styles, strip tags,
 *  decode a handful of common entities, collapse whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Keep paragraph/heading breaks as newlines so structure survives.
    .replace(/<\/(p|div|h[1-6]|li|br|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "blog-generate", 8, 60_000);
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
      { error: "AI blog generator is not configured (OPENAI_API_KEY missing)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const str = (v: unknown, n = 300) =>
    typeof v === "string" ? v.slice(0, n) : "";
  const sourceUrl = str(body?.sourceUrl, 2048).trim();
  const mode = str(body?.mode, 16) === "fresh" ? "fresh" : "rewrite";
  const instructions = str(body?.instructions, 600).trim();

  // Fetch the reference article. fetchPublicUrl re-validates every redirect
  // hop (host + DNS), so a public URL can't 302 the fetch onto an internal
  // address.
  let articleHtml: string;
  try {
    const ref = await fetchPublicUrl(sourceUrl, {
      headers: {
        // Some sites 403 the default fetch UA; present a normal browser UA.
        "User-Agent": `Mozilla/5.0 (compatible; ThisnthatBot/1.0; +${SITE_URL})`,
        Accept: "text/html,application/xhtml+xml",
      },
      timeoutMs: 12_000,
    });
    if (!ref.ok) {
      return NextResponse.json(
        { error: `Could not fetch the reference article (${ref.status}).` },
        { status: 502 },
      );
    }
    const ct = ref.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(ct)) {
      return NextResponse.json(
        { error: "Reference link must point to an HTML article." },
        { status: 415 },
      );
    }
    articleHtml = (await ref.text()).slice(0, 400_000);
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut
          ? "The reference article took too long to load."
          : "Could not reach the reference article URL.",
      },
      { status: timedOut ? 504 : 502 },
    );
  }

  const articleText = htmlToText(articleHtml).slice(0, 12_000);
  if (articleText.length < 200) {
    return NextResponse.json(
      {
        error:
          "Couldn't extract enough article text from that link. Try a direct article URL.",
      },
      { status: 422 },
    );
  }

  const userText = [
    `Mode: ${mode}`,
    instructions ? `Editor instructions: ${instructions}` : "",
    `Reference article URL: ${sourceUrl}`,
    "Reference article text follows between the markers.",
    "---BEGIN REFERENCE---",
    articleText,
    "---END REFERENCE---",
  ]
    .filter(Boolean)
    .join("\n");

  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      // Kept well under common proxy/gateway timeouts (Cloudflare ~100s) so the
      // route returns its own JSON 504 instead of the platform's HTML error page
      // (which the browser can't parse as JSON). Combined worst case with the
      // 12s article fetch stays ~57s.
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 2200,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
      }),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut
          ? "The AI service took too long. Please try again."
          : "Could not reach the AI service. Try again.",
      },
      { status: timedOut ? 504 : 502 },
    );
  }

  if (!aiRes.ok) {
    return NextResponse.json(
      { error: `AI service error (${aiRes.status}).` },
      { status: 502 },
    );
  }

  const data = await aiRes.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content;
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "AI returned an unexpected response. Try again." },
      { status: 502 },
    );
  }

  const title = String(parsed?.title ?? "").trim().slice(0, 200);
  const excerpt = String(parsed?.excerpt ?? "").trim().slice(0, 320);
  const content = String(parsed?.content ?? "").trim().slice(0, 40_000);

  if (!title || content.length < 50) {
    return NextResponse.json(
      { error: "No article produced. Try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ title, excerpt, content, sourceUrl });
}
