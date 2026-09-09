"use client";

import { useEffect, useRef, useState } from "react";

type Photo = { url: string; label?: string };

const MAX_FILES = 12;

/**
 * Re-encode any selected/captured image to JPEG in the browser before upload.
 * This fixes iPhone camera/library photos that arrive as HEIC (which the API
 * rejects and most browsers can't display), and shrinks oversized photos so
 * the upload reliably succeeds. Falls back to the original file if the browser
 * can't decode it.
 */
export async function toUploadable(file: File): Promise<File> {
  try {
    // `from-image` applies the EXIF orientation tag as the photo is decoded.
    // Without it some browsers hand back the raw sensor pixels, and since the
    // canvas re-encode below drops EXIF entirely, a phone photo shot sideways
    // would be stored sideways with nothing left to say which way is up.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const maxDim = 1800;
    let { width, height } = bitmap;
    if (Math.max(width, height) > maxDim) {
      const s = maxDim / Math.max(width, height);
      width = Math.round(width * s);
      height = Math.round(height * s);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, "image/jpeg", 0.85),
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Turn an image file a quarter turn clockwise, re-encoded as JPEG. Done in the
 * browser so the grid responds instantly and — more to the point — so the
 * photo is already upright when it reaches /api/upload, where the watermark
 * and the auto-level pass are applied. Throws when the browser can't decode
 * the file (the same photos toUploadable has to pass through untouched), so
 * the caller can say so instead of appearing to do nothing.
 */
export async function rotateImageFile(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const canvas = document.createElement("canvas");
  // Axes swap: a portrait photo comes back landscape, and vice versa.
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw new Error("This browser can't rotate photos.");
  }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close?.();
  const blob: Blob | null = await new Promise((res) =>
    // A notch above toUploadable's 0.85: this is a re-encode of an already
    // compressed photo, and a seller may turn the same one more than once.
    canvas.toBlob(res, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("Couldn't rotate that photo.");
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

/**
 * Turn a photo we only have a URL for — one already uploaded, or a pasted-URL
 * import. R2 is a different origin, so the browser can't read those pixels
 * back out of a canvas; /api/photo-rotate turns them with sharp and returns
 * the URL of the rotated copy.
 */
export async function rotateStoredPhoto(url: string): Promise<string> {
  const res = await fetch("/api/photo-rotate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, degrees: 90 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Couldn't rotate that photo.");
  }
  return data.url as string;
}

/** Quarter-turn-clockwise arrow for the per-photo rotate button. */
export function RotateIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

/**
 * If `value`/`onChange` are passed the component is fully controlled (the
 * parent owns the photo list). Otherwise it manages its own state and exposes
 * the current URLs via the hidden `name="photos"` input for plain form submit.
 */
export function PhotoUploader({
  value,
  onChange,
}: {
  value?: string[];
  onChange?: (urls: string[]) => void;
} = {}) {
  const controlled = value !== undefined && typeof onChange === "function";
  const [internalPhotos, setInternalPhotos] = useState<Photo[]>([]);
  const photos: Photo[] = controlled
    ? (value as string[]).map((url) => ({ url }))
    : internalPhotos;
  // Functional updates must resolve against the LATEST list, not the render
  // that started an async upload — otherwise an upload finishing after the
  // parent changed `value` (second batch dropped, a photo deleted) clobbers
  // that change. The ref tracks the current list (synced post-render).
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  });
  const setPhotos = (next: Photo[] | ((p: Photo[]) => Photo[])) => {
    if (controlled) {
      const resolved =
        typeof next === "function"
          ? (next as (p: Photo[]) => Photo[])(photosRef.current)
          : next;
      onChange!(resolved.map((p) => p.url));
    } else {
      setInternalPhotos(next);
    }
  };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // URL of the photo currently being turned, or null. One at a time: each
  // rotate is a round trip, and the grid is small enough that queuing them up
  // would only make it unclear which photo you're waiting on.
  const [rotating, setRotating] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    const remaining = Math.max(0, MAX_FILES - photos.length);
    if (remaining === 0) {
      setMsg(`You can attach up to ${MAX_FILES} photos.`);
      return;
    }
    const accepted = files.slice(0, remaining);
    if (accepted.length < files.length) {
      setMsg(`Took the first ${accepted.length} — limit is ${MAX_FILES}.`);
    } else {
      setMsg("");
    }
    setBusy(true);
    try {
      const fd = new FormData();
      const prepared = await Promise.all(accepted.map(toUploadable));
      for (const f of prepared) fd.append("files", f);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}) as { error?: string; urls?: string[]; url?: string });
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      const urls: string[] = data.urls ?? (data.url ? [data.url] : []);
      setPhotos((p) => [
        ...p,
        ...urls.map((u, i) => ({ url: u, label: accepted[i]?.name })),
      ]);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    upload(files);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    upload(files);
  }

  // Pasted URLs are imported into our own R2 storage server-side instead of
  // hotlinked: many hosts (e.g. Google image thumbnails) block browsers that
  // send a cross-site Referer, so a hotlink "saves" but renders broken.
  async function addUrl() {
    const v = prompt("Paste an image URL");
    if (!v?.trim()) return;
    if (photos.length >= MAX_FILES) {
      setMsg(`You can attach up to ${MAX_FILES} photos.`);
      return;
    }
    setBusy(true);
    setMsg("Importing image…");
    try {
      const res = await fetch("/api/photo-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: v.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Couldn't import that image URL.");
      }
      setPhotos((p) => [...p, { url: data.url }]);
      setMsg("");
    } catch (err) {
      setMsg(
        err instanceof Error ? err.message : "Couldn't import that image URL.",
      );
    } finally {
      setBusy(false);
    }
  }

  function remove(i: number) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  }

  // Turn a photo a quarter turn clockwise. Everything in this grid is already
  // uploaded, so the server rotates it and hands back the URL of the rotated
  // copy — which sticks once the form is saved, like a removal or a reorder.
  async function rotate(url: string) {
    if (busy || rotating) return;
    setRotating(url);
    setMsg("");
    try {
      const rotatedUrl = await rotateStoredPhoto(url);
      setPhotos((p) =>
        p.map((x) => (x.url === url ? { ...x, url: rotatedUrl } : x)),
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't rotate that photo.");
    } finally {
      setRotating(null);
    }
  }

  // Drag-to-reorder: order IS the gallery order; the first photo is the cover.
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setPhotos((p) => {
      if (from >= p.length || to >= p.length) return p;
      const next = [...p];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {/* JSON array, not comma-joined — URLs may legally contain commas. */}
      <input
        type="hidden"
        name="photos"
        value={JSON.stringify(photos.map((p) => p.url))}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`bx-panel p-6 text-center cursor-pointer transition-colors ${
          dragOver ? "bx-panel--accent" : ""
        } ${busy ? "opacity-70 pointer-events-none" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={onPick}
          disabled={busy}
        />
        <p className="font-display text-lg">
          {busy ? "Uploading…" : "Drop photos here or click to choose"}
        </p>
        <p className="text-xs text-muted mt-1">
          PNG, JPG, WebP, GIF, AVIF · up to {MAX_FILES} · 10 MB each
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="bx-btn bx-btn--ghost !py-2 !px-4"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          Choose files…
        </button>
        <button
          type="button"
          className="bx-btn bx-btn--ghost !py-2 !px-4"
          onClick={addUrl}
          disabled={busy}
        >
          Paste URL
        </button>
      </div>

      {msg && <p className="text-red-600 text-sm">{msg}</p>}

      {photos.length > 0 && (
        <>
          {photos.length > 1 && (
            <p className="text-xs text-muted">
              Drag to reorder — the first photo is your listing&apos;s cover.
            </p>
          )}
          <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {photos.map((p, i) => (
              <li
                key={p.url + i}
                draggable={photos.length > 1}
                onDragStart={() => {
                  dragIndex.current = i;
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverIndex !== i) setDragOverIndex(i);
                }}
                onDragLeave={() => setDragOverIndex((c) => (c === i ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex.current !== null) move(dragIndex.current, i);
                  dragIndex.current = null;
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  dragIndex.current = null;
                  setDragOverIndex(null);
                }}
                className={`relative bx-panel p-1 overflow-hidden transition-[outline] ${
                  photos.length > 1 ? "cursor-move" : ""
                } ${
                  dragOverIndex === i
                    ? "outline outline-2 outline-[var(--bx-red)]"
                    : ""
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.label ?? `Photo ${i + 1}`}
                  className="w-full aspect-square object-cover rounded-md pointer-events-none"
                />
                {i === 0 && (
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-[var(--bx-ink)] text-white text-[9px] font-bold px-1.5 py-0.5">
                    COVER
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => rotate(p.url)}
                  aria-label={`Rotate ${p.label ?? "photo"} right`}
                  title="Rotate right"
                  className="absolute top-9 right-1.5 w-6 h-6 rounded-full bg-[var(--bx-ink)] text-white grid place-items-center hover:bg-[var(--bx-red)] transition-colors disabled:opacity-60"
                  disabled={busy || rotating !== null}
                >
                  <RotateIcon
                    className={`w-3.5 h-3.5 ${
                      rotating === p.url ? "animate-spin" : ""
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${p.label ?? "photo"}`}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[var(--bx-ink)] text-white text-sm leading-none hover:bg-[var(--bx-red)] transition-colors"
                >
                  ×
                </button>
                {p.label && (
                  <p className="absolute bottom-0 left-0 right-0 text-[10px] text-white bg-black/55 px-1.5 py-0.5 truncate">
                    {p.label}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
