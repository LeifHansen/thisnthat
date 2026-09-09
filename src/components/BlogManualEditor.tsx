"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { saveBlogPost } from "@/lib/blog";
import { toUploadable } from "@/components/PhotoUploader";

/**
 * Hand-written blog posts — the manual counterpart to BlogGenerator.
 * Same save action (`saveBlogPost`) and the same cover-image affordances
 * (paste a URL or upload a file), minus the AI step: the editor fields
 * start empty and the admin writes the Markdown themselves.
 */
export function BlogManualEditor() {
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const validImage = /^https?:\/\//i.test(imageUrl.trim());

  return (
    <form action={saveBlogPost} className="bx-panel p-5 space-y-4">
      <input type="hidden" name="coverImageUrl" value={imageUrl} />

      <div className="space-y-1">
        <label className="text-sm font-semibold text-ink">Title</label>
        <input
          name="title"
          className="bx-input"
          placeholder="e.g. The 10 Most Valuable Beanie Babies of 2026"
          maxLength={200}
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-semibold text-ink">
          Hero image <span className="text-muted font-normal">(optional)</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            className="bx-input flex-1 min-w-[220px]"
            placeholder="https://…/hero.jpg"
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
            className="bx-btn bx-btn--ghost !py-2 !px-4 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Upload image…"}
          </button>
        </div>
        <p className="text-xs text-muted">
          Paste an image URL or upload a file from your device.
        </p>
        {uploadErr && <p className="text-pink text-sm">{uploadErr}</p>}
        {validImage && (
          <div className="relative mt-2 w-full max-w-sm aspect-[16/9] overflow-hidden rounded-lg border border-[var(--bx-line)] bg-[var(--bx-surface)]">
            <Image
              src={imageUrl}
              alt="Hero preview"
              fill
              sizes="(max-width: 640px) 100vw, 24rem"
              unoptimized
              className="object-cover"
            />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-semibold text-ink">
          Excerpt / summary{" "}
          <span className="text-muted font-normal">
            (shown on the blog index and in search results)
          </span>
        </label>
        <textarea
          name="excerpt"
          className="bx-input"
          rows={2}
          maxLength={320}
          placeholder="One or two sentences summarizing the post."
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-semibold text-ink">
          Body <span className="text-muted font-normal">(Markdown)</span>
        </label>
        <textarea
          name="content"
          className="bx-input font-mono text-sm"
          rows={18}
          placeholder={"## Heading\n\nWrite your post in Markdown…"}
          required
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="publish"
          className="bx-btn bx-btn--green"
        >
          Publish
        </button>
        <button
          type="submit"
          name="intent"
          value="draft"
          className="bx-btn bx-btn--ghost"
        >
          Save as draft
        </button>
      </div>
    </form>
  );
}
