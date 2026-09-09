"use client";

import { canOptimizeImage } from "@/lib/photos";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CATEGORIES, type CatalogueRow } from "@/lib/beanie-types";
import { formatCents } from "@/lib/fees";
import { beanieImageAlt, beaniePlaceholderAlt } from "@/lib/image-seo";
import {
  CatalogueRowEditor,
  type EditableEntry,
} from "@/components/CatalogueRowEditor";

const LETTERS = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
// Minimum recent sales before we lead the value column with the eBay median.
const SOLD_MIN = 2;
// Rows fetched per page.
const PAGE_LIMIT = 100;

// Stable per-row identity (name + style #). ~127 expanded-roster entries share
// a name (e.g. "Blue" the Bear vs "Blue" the Dog), so this disambiguates which
// row the editor opens. Photos/overrides/sold are keyed by name in the DB, so
// true same-name duplicates still share those — the name-based patch below is
// intentionally consistent with that.
const rowId = (r: CatalogueRow) => `${r.originalName}::${r.styleNumber ?? ""}`;

function fmt(low: number | null, high: number | null): string {
  if (low == null || high == null) return "—";
  return low === high ? `$${low}` : `$${low}–$${high}`;
}

const COLLECTIONS = [
  { key: "All", label: "All collections" },
  { key: "original", label: "Original era" },
  { key: "expanded", label: "Expanded roster" },
] as const;

export function BeanieDatabaseTable({
  initialRows,
  initialTotal,
  initialQuery = "",
  initialSort = "name",
  canGenerate = false,
  canEdit = false,
}: {
  initialRows: CatalogueRow[];
  initialTotal: number;
  initialQuery?: string;
  initialSort?: "name" | "year";
  /** Superadmin: AI placeholder generation is available in the editor. */
  canGenerate?: boolean;
  /** Superadmin: show the per-row edit control. */
  canEdit?: boolean;
}) {
  const [q, setQ] = useState(initialQuery);
  const [cat, setCat] = useState("All");
  const [letter, setLetter] = useState("All");
  const [collection, setCollection] = useState("All");
  const sort = initialSort;

  const [rows, setRows] = useState<CatalogueRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // The initial page already matches the initial filters — don't refetch on mount.
  const skipInitial = useRef(true);
  // Monotonic request id so a slow earlier response can't overwrite a newer one.
  const reqSeq = useRef(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (cat !== "All") p.set("category", cat);
    if (letter !== "All") p.set("letter", letter);
    if (collection !== "All") p.set("collection", collection);
    p.set("sort", sort);
    return p.toString();
  }, [q, cat, letter, collection, sort]);

  const run = useCallback(
    async (append: boolean, offset: number) => {
      const myReq = ++reqSeq.current;
      const p = new URLSearchParams(query);
      p.set("offset", String(offset));
      p.set("limit", String(PAGE_LIMIT));
      setLoading(true);
      try {
        const res = await fetch(`/api/beanies?${p.toString()}`);
        // Ignore a response that a newer request has already superseded.
        if (!res.ok || myReq !== reqSeq.current) return;
        const data = await res.json();
        if (myReq !== reqSeq.current) return;
        const got: CatalogueRow[] = Array.isArray(data.rows) ? data.rows : [];
        setTotal(typeof data.total === "number" ? data.total : got.length);
        setRows((prev) => (append ? [...prev, ...got] : got));
      } catch {
        // network hiccup — keep what we have
      } finally {
        if (myReq === reqSeq.current) setLoading(false);
      }
    },
    [query],
  );

  // Refetch (debounced) whenever a filter changes; skip the initial render.
  useEffect(() => {
    if (skipInitial.current) {
      skipInitial.current = false;
      return;
    }
    const t = setTimeout(() => run(false, 0), 150);
    return () => clearTimeout(t);
  }, [run]);

  function patchRow(originalName: string, patch: Partial<CatalogueRow>) {
    setRows((rs) =>
      rs.map((r) => (r.originalName === originalName ? { ...r, ...patch } : r)),
    );
  }

  const editingRow = editingId
    ? rows.find((r) => rowId(r) === editingId) ?? null
    : null;
  // Base name (DB key) for the open row — stable string for the editor callbacks.
  const editingOriginalName = editingRow?.originalName ?? "";
  const editingEntry: EditableEntry | null = editingRow
    ? {
        name: editingRow.name,
        animal: editingRow.animal,
        category: editingRow.category,
        year: editingRow.year,
        styleNumber: editingRow.styleNumber,
        valueLow: editingRow.valueLow,
        valueHigh: editingRow.valueHigh,
        note: editingRow.note,
      }
    : null;

  return (
    <div className="space-y-5">
      {/* Search */}
      <input
        className="bx-input"
        placeholder="Search by name, animal, or category…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search the Beanie Baby database"
      />

      {/* Collection chips */}
      <div className="flex flex-wrap gap-2">
        {COLLECTIONS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCollection(c.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
              collection === c.key
                ? "bg-[var(--bx-ink)] text-white border-[var(--bx-ink)]"
                : "bg-white text-[var(--bx-ink-soft)] border-[var(--bx-line-strong)] hover:border-[var(--bx-muted)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {["All", ...CATEGORIES].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
              cat === c
                ? "bg-[var(--bx-red)] text-white border-[var(--bx-red)]"
                : "bg-white text-[var(--bx-ink-soft)] border-[var(--bx-line-strong)] hover:border-[var(--bx-muted)]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Alphabet */}
      <div className="flex flex-wrap gap-1.5 sm:gap-1">
        <button
          type="button"
          onClick={() => setLetter("All")}
          className={`h-9 min-w-9 sm:h-7 sm:min-w-7 px-1.5 rounded text-xs font-bold ${
            letter === "All"
              ? "bg-[var(--bx-ink)] text-white"
              : "text-[var(--bx-muted)] hover:text-[var(--bx-ink)]"
          }`}
        >
          All
        </button>
        {LETTERS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLetter(l)}
            className={`h-9 min-w-9 sm:h-7 sm:min-w-7 rounded text-xs font-bold ${
              letter === l
                ? "bg-[var(--bx-ink)] text-white"
                : "text-[var(--bx-muted)] hover:text-[var(--bx-ink)]"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted">
        {total.toLocaleString()} {total === 1 ? "beanie" : "beanies"}
        {loading ? " · loading…" : ""}
      </p>

      {/* Table */}
      <div className="bx-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-[var(--bx-line)]">
                <th className="px-4 py-3 font-semibold sr-only">Photo</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Animal</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Year</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Style #</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Est. Value</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.originalName}::${r.styleNumber ?? ""}`}
                  className="border-b border-[var(--bx-line)] last:border-0 align-top hover:bg-[var(--bx-surface)]"
                >
                  <td className="pl-4 py-3">
                    <BeanieImageCell
                      name={r.name}
                      animal={r.animal}
                      year={r.year}
                      url={r.photoUrl ?? undefined}
                      canEdit={canEdit}
                      onEdit={() => setEditingId(rowId(r))}
                    />
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {r.name}
                    <span
                      className={`ml-2 inline-block align-middle rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        r.collection === "expanded"
                          ? "bg-[var(--bx-surface)] text-[var(--bx-muted)] border border-[var(--bx-line-strong)]"
                          : "bg-[var(--bx-red)]/10 text-[var(--bx-red)]"
                      }`}
                    >
                      {r.collection === "expanded" ? "Ty roster" : "Original"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{r.animal}</td>
                  <td className="px-4 py-3 text-muted">{r.category}</td>
                  <td className="px-4 py-3 text-muted">{r.year ?? "—"}</td>
                  <td className="px-4 py-3 text-muted tabular-nums whitespace-nowrap">
                    {r.styleNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.soldMedianCents != null && r.soldCount >= SOLD_MIN ? (
                      <>
                        <span className="font-semibold text-[var(--bx-red)]">
                          {formatCents(r.soldMedianCents)}
                        </span>
                        <span className="block text-[10px] text-[var(--bx-muted)]">
                          eBay median · {r.soldCount} sold
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold text-[var(--bx-red)]">
                        {fmt(r.valueLow, r.valueHigh)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted max-w-md">
                    {r.note ?? (r.birthday ? "" : "—")}
                    {r.birthday && (
                      <span className="block text-xs text-[var(--bx-muted)]">
                        🎂 Birthday: {r.birthday}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted">
                    No beanies match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length < total && (
          <div className="border-t border-[var(--bx-line)] p-3 text-center">
            <button
              type="button"
              onClick={() => run(true, rows.length)}
              disabled={loading}
              className="rounded-full px-4 py-2 text-xs font-semibold border border-[var(--bx-line-strong)] bg-white text-[var(--bx-ink-soft)] hover:border-[var(--bx-muted)] disabled:opacity-50"
            >
              {loading
                ? "Loading…"
                : `Show more (${(total - rows.length).toLocaleString()} more)`}
            </button>
          </div>
        )}
      </div>

      {editingId && editingRow && editingEntry && (
        <CatalogueRowEditor
          originalName={editingOriginalName}
          entry={editingEntry}
          imageUrl={editingRow.photoUrl ?? undefined}
          canGenerate={canGenerate}
          onClose={() => setEditingId(null)}
          onPhotoChanged={(url) =>
            patchRow(editingOriginalName, { photoUrl: url })
          }
          onSaved={(saved, imageUrl) => {
            patchRow(editingOriginalName, {
              name: saved.name,
              animal: saved.animal,
              category: saved.category,
              year: saved.year,
              styleNumber: saved.styleNumber,
              valueLow: saved.valueLow,
              valueHigh: saved.valueHigh,
              note: saved.note,
              ...(imageUrl !== undefined ? { photoUrl: imageUrl } : {}),
            });
          }}
          onReset={() => {
            // Reverted to catalogue defaults — refetch to pull the base values.
            run(false, 0);
          }}
        />
      )}
    </div>
  );
}

// One catalogue image cell: the thumbnail plus, for superadmins, an Edit button
// that opens the row editor. Alt/title text is SEO-optimized via image-seo.
function BeanieImageCell({
  name,
  animal,
  year,
  url,
  canEdit,
  onEdit,
}: {
  name: string;
  animal: string;
  year: number | null;
  url?: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const alt = url
    ? beanieImageAlt(name, { animal, year })
    : beaniePlaceholderAlt(name);
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[var(--bx-line)] bg-[var(--bx-surface)]">
        {/* These are 48px thumbnails of full-size (500-700KB) R2 photos, up
            to 100 per page — optimize them wherever the host allows it, and
            only fall back to the original bytes for legacy off-R2 URLs the
            optimizer would reject. */}
        <Image
          src={url || "/placeholderlisting.webp"}
          alt={alt}
          title={alt}
          width={48}
          height={48}
          className="h-full w-full object-cover"
          unoptimized={!canOptimizeImage(url)}
        />
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          title="Edit this catalogue entry"
          className="rounded-full border border-[var(--bx-purple)] px-2 py-0.5 text-[10px] font-semibold text-[var(--bx-purple)] hover:bg-[var(--bx-purple-soft)] whitespace-nowrap"
        >
          ✎ Edit
        </button>
      )}
    </div>
  );
}
