"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { saveBlogPost } from "@/lib/blog";
import { toUploadable } from "@/components/PhotoUploader";

type GenResult = {
  title: string;
  excerpt: string;
  content: string;
  sourceUrl: string;
};

export function BlogGenerator() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [mode, setMode] = useState<"rewrite" | "fresh">("rewrite");
  const [instructions, setInstructions] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [heroBusy, setHeroBusy] = useState(false);

  // Editable draft fields, populated by the generator and saved by the form.
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [hasDraft, setHasDraft] = useState(false);

  async function generate() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/blog-generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceUrl, mode, instructions }),
      });
      // The route always answers with JSON, but a proxy/gateway timeout on the
      // long article-fetch + AI call can return an HTML error page instead.
      // Parse defensively so the admin sees a real message rather than a raw
      // "Unexpected token '<'" JSON syntax error.
      const bodyText = await res.text();
      let data: (GenResult & { error?: string }) | null = null;
      try {
        data = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        data = null;
      }
      if (!res.ok || !data) {
        throw new Error(
          data?.error ??
            (res.status === 502 || res.status === 504 || res.status === 524
              ? "The article or AI service took too long to respond. Try a lighter source URL, or try again."
              : `The generator returned an unexpected response (HTTP ${res.status}). Please try again.`),
        );
      }
      const r = data as GenResult;
      setTitle(r.title);
      setExcerpt(r.excerpt);
      setContent(r.content);
      setHasDraft(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not generate the article");
    } finally {
      setBusy(false);
    }
  }

  async function uploadCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadErr("");
    try {
      const fd = new FormData();
      fd.append("kind", "blog"); // editorial hero — stored under blog/, no watermark
      fd.append("file", await toUploadable(file));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      const url: string | undefined = data.urls?.[0] ?? data.url;
      if (!url) throw new Error("Upload failed");
      setImageUrl(url);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // AI hero image: art-directed from the generated draft, so it needs one.
  async function generateHero() {
    setHeroBusy(true);
    setUploadErr("");
    try {
      const res = await fetch("/api/blog-hero-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, excerpt, instructions }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "Could not generate a hero image");
      }
      setImageUrl(data.url);
    } catch (e) {
      setUploadErr(
        e instanceof Error ? e.message : "Could not generate a hero image",
      );
    } finally {
      setHeroBusy(false);
    }
  }

  const validImage = /^https?:\/\//i.test(imageUrl.trim());

  return (
    <div className="space-y-5">
      {/* ── Inputs ── */}
      <div className="tnt-panel p-5 space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-semibold text-ink">
            Reference article URL
          </label>
          <input
            type="url"
            className="tnt-input"
            placeholder="https://example.com/some-article-about-resale"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
          <p className="text-xs text-muted">
            The AI fetches this article and writes (or rewrites) it as an
            original post for the blog.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-semibold text-ink">
            Cover image{" "}
            <span className="text-muted font-normal">(optional)</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="url"
              className="tnt-input flex-1 min-w-[220px]"
              placeholder="https://…/cover.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              disabled={uploading}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={uploadCover}
              disabled={uploading}
            />
            <button
              type="button"
              className="tnt-btn tnt-btn--ghost !py-2 !px-4 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Upload image…"}
            </button>
            <button
              type="button"
              className="tnt-btn tnt-btn--ghost !py-2 !px-4 shrink-0"
              onClick={generateHero}
              disabled={heroBusy || uploading || !hasDraft}
              title={
                hasDraft
                  ? "AI-generate a hero image from the drafted article"
                  : "Generate the article first"
              }
            >
              {heroBusy ? "Painting…" : "✨ Generate hero"}
            </button>
          </div>
          <p className="text-xs text-muted">
            Paste an image URL, upload a file, or (once the article is drafted)
            let the AI paint a hero image from it.
          </p>
          {uploadErr && <p className="text-pink text-sm">{uploadErr}</p>}
          {validImage && (
            <div className="relative mt-2 w-full max-w-sm aspect-[16/9] overflow-hidden rounded-lg border border-[var(--tnt-line)] bg-[var(--tnt-surface)]">
              <Image
                src={imageUrl}
                alt="Cover preview"
                fill
                sizes="(max-width: 640px) 100vw, 24rem"
                unoptimized
                className="object-cover"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-ink">Mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("rewrite")}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold border-2 border-[var(--tnt-ink)] ${
                  mode === "rewrite"
                    ? "bg-[var(--tnt-blue-bright)] !text-ink"
                    : "bg-white !text-muted"
                }`}
              >
                Rewrite article
              </button>
              <button
                type="button"
                onClick={() => setMode("fresh")}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold border-2 border-[var(--tnt-ink)] ${
                  mode === "fresh"
                    ? "bg-[var(--tnt-green-bright)] !text-ink"
                    : "bg-white !text-muted"
                }`}
              >
                Fresh take
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-semibold text-ink">
            Angle / instructions{" "}
            <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            type="text"
            className="tnt-input"
            placeholder="e.g. focus on how to photograph clothing for resale"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>

        {err && <p className="text-pink text-sm">{err}</p>}

        <button
          type="button"
          onClick={generate}
          disabled={busy || sourceUrl.trim().length < 8}
          className="tnt-btn disabled:opacity-60"
        >
          {busy ? "Writing…" : hasDraft ? "Re-generate" : "✨ Generate article"}
        </button>
      </div>

      {/* ── Editable draft + save form ── */}
      {hasDraft && (
        <form action={saveBlogPost} className="tnt-panel p-5 space-y-4">
          <input type="hidden" name="coverImageUrl" value={imageUrl} />
          <input type="hidden" name="sourceUrl" value={sourceUrl} />

          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-lg text-ink">Review &amp; edit draft</h3>
            <span className="text-xs text-muted">
              Edit anything below before saving.
            </span>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-ink">Title</label>
            <input
              name="title"
              className="tnt-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-ink">
              Excerpt / summary
            </label>
            <textarea
              name="excerpt"
              className="tnt-input"
              rows={2}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              maxLength={320}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-ink">
              Body{" "}
              <span className="text-muted font-normal">(Markdown)</span>
            </label>
            <textarea
              name="content"
              className="tnt-input font-mono text-sm"
              rows={18}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="intent"
              value="publish"
              className="tnt-btn tnt-btn--green"
            >
              Publish
            </button>
            <button
              type="submit"
              name="intent"
              value="draft"
              className="tnt-btn tnt-btn--ghost"
            >
              Save as draft
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
