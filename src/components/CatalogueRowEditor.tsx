"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "@/lib/beanie-types";
import { beanieImageAlt, beaniePlaceholderAlt } from "@/lib/image-seo";

// Superadmin-only editor for a single /database catalogue row: its fields and
// its reference photo. Posts to /api/admin/beanie-entry, which stores field
// changes in BeanieOverride and the photo in BeanieImage. Everything reverts to
// the static catalogue when "Reset to catalogue default" is used.

export type EditableEntry = {
  name: string;
  animal: string;
  category: string;
  year: number | null;
  styleNumber: string | null;
  valueLow: number | null;
  valueHigh: number | null;
  note: string | null;
};

type ImageMode = "keep" | "upload" | "url" | "remove";

const PLACEHOLDER = "/placeholderlisting.webp";

function numOrNull(s: string): number | null {
  const t = s.replace(/[^0-9-]/g, "");
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

export function CatalogueRowEditor({
  originalName,
  entry,
  imageUrl,
  canGenerate,
  onClose,
  onSaved,
  onReset,
  onPhotoChanged,
}: {
  originalName: string;
  entry: EditableEntry;
  imageUrl?: string;
  /** AI placeholder generation available (OpenAI + R2 configured server-side). */
  canGenerate: boolean;
  onClose: () => void;
  onSaved: (entry: EditableEntry, imageUrl?: string | null) => void;
  onReset: () => void;
  /** Photo changed out-of-band (AI generation already persisted it server-side). */
  onPhotoChanged: (url: string) => void;
}) {
  const [form, setForm] = useState<EditableEntry>(entry);
  const [preview, setPreview] = useState<string | undefined>(imageUrl);
  const [imageMode, setImageMode] = useState<ImageMode>("keep");
  const [file, setFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState<null | "save" | "reset" | "ai">(null);
  const [err, setErr] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Revoke any object URL we created for a local file preview.
  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function set<K extends keyof EditableEntry>(k: K, v: EditableEntry[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function pickFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setImageMode("upload");
    setUrlInput("");
    setPreview(URL.createObjectURL(f));
  }

  function applyUrl() {
    const u = urlInput.trim();
    if (!u) return;
    setImageMode("url");
    setFile(null);
    setPreview(u);
  }

  function removePhoto() {
    setImageMode("remove");
    setFile(null);
    setUrlInput("");
    setPreview(undefined);
  }

  async function generateAI() {
    setBusy("ai");
    setErr("");
    try {
      const res = await fetch("/api/admin/beanie-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: originalName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? "Generation failed.");
      // The endpoint already stored the BeanieImage row; reflect it and tell
      // the parent so the table thumbnail updates immediately.
      const busted = `${data.url}?v=${Date.now()}`;
      setPreview(busted);
      setImageMode("keep");
      setFile(null);
      onPhotoChanged(busted);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setErr("");
    try {
      const fd = new FormData();
      fd.set("action", "save");
      fd.set("originalName", originalName);
      fd.set("name", form.name);
      fd.set("animal", form.animal);
      fd.set("category", form.category);
      fd.set("year", form.year == null ? "" : String(form.year));
      fd.set("styleNumber", form.styleNumber ?? "");
      fd.set("valueLow", form.valueLow == null ? "" : String(form.valueLow));
      fd.set("valueHigh", form.valueHigh == null ? "" : String(form.valueHigh));
      fd.set("note", form.note ?? "");
      fd.set("imageMode", imageMode);
      if (imageMode === "upload" && file) fd.set("file", file);
      if (imageMode === "url") fd.set("imageUrl", urlInput.trim());

      const res = await fetch("/api/admin/beanie-entry", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed.");
      onSaved(
        (data.entry as EditableEntry) ?? form,
        // undefined = photo unchanged; null = removed; string = new URL.
        "imageUrl" in data ? data.imageUrl : undefined,
      );
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  async function pullSoldData() {
    setIngesting(true);
    setIngestMsg("");
    try {
      const res = await fetch("/api/admin/sold/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: originalName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Ingest failed.");
      const med =
        data.apiMedianCents != null
          ? ` · eBay median ~$${Math.round(data.apiMedianCents / 100)}`
          : "";
      setIngestMsg(
        `Imported ${data.stored} recent sale${data.stored === 1 ? "" : "s"}${med}.`,
      );
    } catch (e) {
      setIngestMsg(e instanceof Error ? e.message : "Ingest failed.");
    } finally {
      setIngesting(false);
    }
  }

  async function resetToDefault() {
    setBusy("reset");
    setErr("");
    try {
      const fd = new FormData();
      fd.set("action", "reset");
      fd.set("originalName", originalName);
      const res = await fetch("/api/admin/beanie-entry", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Reset failed.");
      onReset();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed.");
    } finally {
      setBusy(null);
    }
  }

  const alt = preview
    ? beanieImageAlt(form.name, { animal: form.animal, year: form.year })
    : beaniePlaceholderAlt(form.name);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${originalName}`}
      onClick={() => !busy && onClose()}
    >
      <div
        className="bx-panel w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Edit catalogue entry</h2>
            <p className="text-xs text-muted">
              Superadmin only · changes show on the public database. Reset to
              revert to the built-in catalogue values.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-[var(--bx-surface)] text-[var(--bx-ink)] hover:bg-[var(--bx-line)] text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Photo */}
        <div className="flex gap-4">
          <span className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[var(--bx-line)] bg-[var(--bx-surface)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview || PLACEHOLDER}
              alt={alt}
              title={alt}
              className="h-full w-full object-cover"
            />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="bx-btn bx-btn--ghost !py-1 !px-2 text-xs"
              >
                Upload
              </button>
              {canGenerate && (
                <button
                  type="button"
                  onClick={generateAI}
                  disabled={!!busy}
                  className="rounded-full border border-[var(--bx-purple)] px-2 py-1 text-xs font-semibold text-[var(--bx-purple)] hover:bg-[var(--bx-purple-soft)] disabled:opacity-50"
                >
                  {busy === "ai" ? "Generating…" : "✨ AI"}
                </button>
              )}
              {(preview || imageMode !== "remove") && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="rounded-full border border-[var(--bx-line-strong)] px-2 py-1 text-xs font-semibold text-[var(--bx-muted)] hover:border-[var(--bx-red)] hover:text-[var(--bx-red)]"
                >
                  Remove
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex gap-2">
              <input
                className="bx-input !py-1 text-xs"
                placeholder="…or paste an image URL"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onBlur={applyUrl}
              />
              <button
                type="button"
                onClick={applyUrl}
                className="bx-btn bx-btn--ghost !py-1 !px-2 text-xs shrink-0"
              >
                Use URL
              </button>
            </div>
            <p className="text-[11px] text-muted">
              Reference photo for the catalogue. Uploads are optimized and hosted
              on our own domain.
            </p>
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs font-semibold text-[var(--bx-ink-soft)]">
            Name
            <input
              className="bx-input mt-1"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-[var(--bx-ink-soft)]">
            Animal
            <input
              className="bx-input mt-1"
              value={form.animal}
              onChange={(e) => set("animal", e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-[var(--bx-ink-soft)]">
            Category
            <select
              className="bx-input mt-1"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {!CATEGORIES.includes(form.category as (typeof CATEGORIES)[number]) && (
                <option value={form.category}>{form.category || "—"}</option>
              )}
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--bx-ink-soft)]">
            Year
            <input
              className="bx-input mt-1"
              inputMode="numeric"
              value={form.year ?? ""}
              onChange={(e) => set("year", numOrNull(e.target.value))}
            />
          </label>
          <label className="text-xs font-semibold text-[var(--bx-ink-soft)]">
            Style #
            <input
              className="bx-input mt-1"
              value={form.styleNumber ?? ""}
              onChange={(e) => set("styleNumber", e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-[var(--bx-ink-soft)]">
            Est. value low ($)
            <input
              className="bx-input mt-1"
              inputMode="numeric"
              value={form.valueLow ?? ""}
              onChange={(e) => set("valueLow", numOrNull(e.target.value))}
            />
          </label>
          <label className="text-xs font-semibold text-[var(--bx-ink-soft)]">
            Est. value high ($)
            <input
              className="bx-input mt-1"
              inputMode="numeric"
              value={form.valueHigh ?? ""}
              onChange={(e) => set("valueHigh", numOrNull(e.target.value))}
            />
          </label>
          <label className="col-span-2 text-xs font-semibold text-[var(--bx-ink-soft)]">
            Notes
            <textarea
              className="bx-input mt-1"
              rows={2}
              value={form.note ?? ""}
              onChange={(e) => set("note", e.target.value)}
            />
          </label>
        </div>

        {/* Market data — populate real eBay sold prices for this beanie */}
        <div className="rounded-lg border border-[var(--bx-line)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--bx-ink-soft)]">
                Market data
              </p>
              <p className="text-[11px] text-muted">
                Pull recent eBay sold prices into the price guide + trends.
              </p>
            </div>
            <button
              type="button"
              onClick={pullSoldData}
              disabled={ingesting || !!busy}
              className="bx-btn bx-btn--ghost !py-1.5 shrink-0 text-xs disabled:opacity-50"
            >
              {ingesting ? "Pulling…" : "Pull eBay data"}
            </button>
          </div>
          {ingestMsg && <p className="text-[11px] text-muted mt-1.5">{ingestMsg}</p>}
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={resetToDefault}
            disabled={!!busy}
            className="text-xs font-semibold text-[var(--bx-muted)] hover:text-[var(--bx-red)] disabled:opacity-50"
          >
            {busy === "reset" ? "Resetting…" : "Reset to catalogue default"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => !busy && onClose()}
              className="bx-btn bx-btn--ghost !py-1.5"
              disabled={!!busy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!!busy}
              className="bx-btn !py-1.5"
            >
              {busy === "save" ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
