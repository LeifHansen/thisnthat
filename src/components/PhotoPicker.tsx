"use client";

import { useEffect, useRef, useState } from "react";
import {
  RotateIcon,
  rotateImageFile,
  rotateStoredPhoto,
  toUploadable,
} from "@/components/PhotoUploader";

// Deferred photo picker for the Sell wizard.
//
// Unlike PhotoUploader (which uploads the moment files are picked), files
// here stay LOCAL — previewed via object URLs — until the wizard actually
// needs server URLs (AI autofill, Preview, or Post). That gives the seller
// time to toggle "Studio-optimize photos" BEFORE anything is uploaded, and
// the optimization happens server-side during the one upload pass.
//
// Pasted URLs are the exception: they're imported to R2 immediately (the
// import exists precisely because hotlinks render broken), so those items
// carry a remote URL from the start and no local file.

const MAX_FILES = 12;

export type PhotoItem = {
  id: string;
  /** Local file awaiting upload (absent for pasted-URL imports). */
  file?: File;
  /** What the picker grid shows: an object URL for files, else the R2 URL. */
  previewUrl: string;
  label?: string;
  /** R2 URL of the un-optimized upload/import, once materialized. */
  rawUrl?: string;
  /** R2 URL of the studio-optimized version, once materialized. */
  studioUrl?: string;
};

/**
 * Materialize items into final R2 URLs, uploading/optimizing only what's
 * missing for the requested mode. Returns updated items plus the final URL
 * list (same order), and a human note when studio optimization was skipped.
 * Throws only when a required upload fails outright.
 */
export async function materializePhotos(
  items: PhotoItem[],
  studio: boolean,
): Promise<{ items: PhotoItem[]; urls: string[]; note: string }> {
  const next = [...items];
  let note = "";

  // 1. Upload local files that don't yet have a URL for the requested mode.
  //    With studio on, the server cuts out + stages + watermarks in one pass.
  const pending = next.filter((it) => it.file && !(studio ? it.studioUrl : it.rawUrl));
  if (pending.length > 0) {
    const fd = new FormData();
    for (const it of pending) fd.append("files", it.file as File);
    if (studio) fd.append("studio", "1");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    const urls: string[] = data.urls ?? [];
    const applied: boolean[] = Array.isArray(data.studioApplied)
      ? data.studioApplied
      : pending.map(() => false);
    if (typeof data.studioNote === "string" && data.studioNote) {
      note = data.studioNote;
    }
    pending.forEach((it, i) => {
      const url = urls[i];
      if (!url) return;
      if (studio && applied[i]) it.studioUrl = url;
      else it.rawUrl = url;
    });
  }

  // 2. Studio-optimize remote-only items (pasted URLs) individually.
  if (studio) {
    for (const it of next) {
      if (it.studioUrl || it.file || !it.rawUrl) continue;
      try {
        const res = await fetch("/api/listing-image-optimize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ photoUrl: it.rawUrl }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.url) it.studioUrl = data.url;
        else note = note || data.error || "Some photos couldn't be studio-optimized.";
      } catch {
        note = note || "Some photos couldn't be studio-optimized.";
      }
    }
  }

  const urls = next
    .map((it) => (studio ? (it.studioUrl ?? it.rawUrl) : it.rawUrl) ?? "")
    .filter(Boolean);
  return { items: next, urls, note };
}

export function PhotoPicker({
  items,
  onChange,
  disabled = false,
}: {
  items: PhotoItem[];
  onChange: (items: PhotoItem[]) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false); // paste-URL import only
  const [msg, setMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // id of the photo currently being turned, or null. One at a time: a pasted
  // URL takes a round trip, and the grid is small enough that queuing rotates
  // up would only blur which photo you're waiting on.
  const [rotating, setRotating] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The parent owns `items`, so a rotate that finishes after the seller has
  // added or removed a photo must apply to the list as it is NOW, not the one
  // captured when the rotate started. Synced post-render.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    const remaining = Math.max(0, MAX_FILES - items.length);
    if (remaining === 0) {
      setMsg(`You can attach up to ${MAX_FILES} photos.`);
      return;
    }
    const accepted = files.slice(0, remaining);
    setMsg(
      accepted.length < files.length
        ? `Took the first ${accepted.length} — limit is ${MAX_FILES}.`
        : "",
    );
    // Re-encode HEIC/oversized photos now (cheap, local) so previews render
    // and the eventual upload is small.
    const prepared = await Promise.all(accepted.map(toUploadable));
    onChange([
      ...items,
      ...prepared.map((file, i) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        label: accepted[i]?.name,
      })),
    ]);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    addFiles(
      Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")),
    );
  }

  async function addUrl() {
    const v = prompt("Paste an image URL");
    if (!v?.trim()) return;
    if (items.length >= MAX_FILES) {
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
      onChange([
        ...items,
        { id: crypto.randomUUID(), previewUrl: data.url, rawUrl: data.url },
      ]);
      setMsg("");
    } catch (err) {
      setMsg(
        err instanceof Error ? err.message : "Couldn't import that image URL.",
      );
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string) {
    const it = items.find((x) => x.id === id);
    if (it?.file) URL.revokeObjectURL(it.previewUrl);
    onChange(items.filter((x) => x.id !== id));
  }

  // Turn a photo a quarter turn clockwise — the fix for the sideways phone
  // shots that make up most of what sellers upload.
  //
  // A photo still held as a local file is turned right here in the browser:
  // instant, no upload, and the server then watermarks and auto-levels a photo
  // that is already the right way up. A pasted-URL import has no local file, so
  // the server turns the stored copy instead.
  //
  // Either way, any URL already materialized for this item is dropped, so the
  // next preview or post uploads (and studio-optimizes) the photo as it now
  // looks rather than the sideways one.
  async function rotate(id: string) {
    if (busy || disabled || rotating) return;
    const target = items.find((x) => x.id === id);
    if (!target) return;
    setRotating(id);
    setMsg("");
    try {
      let turned: Partial<PhotoItem>;
      if (target.file) {
        const file = await rotateImageFile(target.file);
        turned = {
          file,
          previewUrl: URL.createObjectURL(file),
          rawUrl: undefined,
          studioUrl: undefined,
        };
      } else if (target.rawUrl) {
        const url = await rotateStoredPhoto(target.rawUrl);
        turned = { previewUrl: url, rawUrl: url, studioUrl: undefined };
      } else {
        return;
      }
      let replaced = false;
      const next = itemsRef.current.map((x) => {
        if (x.id !== id) return x;
        replaced = true;
        return { ...x, ...turned };
      });
      if (target.file) {
        // Release whichever object URL is now dead: the old preview if the
        // rotate landed, the new one if the photo was removed mid-flight.
        URL.revokeObjectURL(
          replaced ? target.previewUrl : (turned.previewUrl as string),
        );
      }
      if (replaced) onChange(next);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't rotate that photo.");
    } finally {
      setRotating(null);
    }
  }

  // Drag-to-reorder: photo order IS the listing's gallery order, and the first
  // is the cover. Native HTML5 DnD, no dependency.
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  const blocked = busy || disabled;

  return (
    <div className="space-y-3">
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
        className={`tnt-panel p-6 text-center cursor-pointer transition-colors ${
          dragOver ? "tnt-panel--accent" : ""
        } ${blocked ? "opacity-70 pointer-events-none" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={onPick}
          disabled={blocked}
        />
        <p className="font-display text-lg">
          {busy ? "Importing…" : "Drop photos here or click to choose"}
        </p>
        <p className="text-xs text-muted mt-1">
          PNG, JPG, WebP, GIF, AVIF · up to {MAX_FILES} · 10 MB each — photos
          upload when you preview or post
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="tnt-btn tnt-btn--ghost !py-2 !px-4"
          onClick={() => inputRef.current?.click()}
          disabled={blocked}
        >
          Choose files…
        </button>
        <button
          type="button"
          className="tnt-btn tnt-btn--ghost !py-2 !px-4"
          onClick={addUrl}
          disabled={blocked}
        >
          Paste URL
        </button>
      </div>

      {msg && <p className="text-red-600 text-sm">{msg}</p>}

      {items.length > 0 && (
        <>
          {items.length > 1 && (
            <p className="text-xs text-muted">
              Drag to reorder — the first photo is your listing&apos;s cover.
            </p>
          )}
          <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {items.map((p, i) => (
              <li
                key={p.id}
                draggable={!disabled && items.length > 1}
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
                className={`relative tnt-panel p-1 overflow-hidden transition-[outline,transform] ${
                  items.length > 1 && !disabled ? "cursor-move" : ""
                } ${
                  dragOverIndex === i
                    ? "outline outline-2 outline-[var(--tnt-red)]"
                    : ""
                }`}
              >
                {/* Local object URLs can't go through next/image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.previewUrl}
                  alt={p.label ?? `Photo ${i + 1}`}
                  className="w-full aspect-square object-cover rounded-md pointer-events-none"
                />
                {i === 0 && (
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-[var(--tnt-ink)] text-white text-[9px] font-bold px-1.5 py-0.5">
                    COVER
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => rotate(p.id)}
                  aria-label={`Rotate ${p.label ?? "photo"} right`}
                  title="Rotate right"
                  className="absolute top-9 right-1.5 w-6 h-6 rounded-full bg-[var(--tnt-ink)] text-white grid place-items-center hover:bg-[var(--tnt-red)] transition-colors disabled:opacity-60"
                  disabled={blocked || rotating !== null}
                >
                  <RotateIcon
                    className={`w-3.5 h-3.5 ${
                      rotating === p.id ? "animate-spin" : ""
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={`Remove ${p.label ?? "photo"}`}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[var(--tnt-ink)] text-white text-sm leading-none hover:bg-[var(--tnt-red)] transition-colors"
                  disabled={disabled}
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
