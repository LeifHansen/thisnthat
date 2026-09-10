"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  PhotoPicker,
  materializePhotos,
  type PhotoItem,
} from "@/components/PhotoPicker";
import { CATEGORIES } from "@/lib/categories";
import { CONDITIONS } from "@/lib/listingOptions";
import { formatCents } from "@/lib/fees";
import { isNextRedirectError } from "@/lib/nextRedirect";
import type { Condition } from "@prisma/client";

// One line in the lot: free-text item name and how many of it the lot holds.
type LotRow = {
  key: number;
  name: string;
  quantity: string;
};

function emptyRow(key: number): LotRow {
  return { key, name: "", quantity: "1" };
}

export function LotWizard({
  userName,
  createLot,
}: {
  userName?: string | null;
  createLot: (formData: FormData) => Promise<{ error: string } | void>;
}) {
  const nextKey = useRef(1);
  const [title, setTitle] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [rows, setRows] = useState<LotRow[]>([emptyRow(0)]);
  const [condition, setCondition] = useState<Condition | "">("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [autoAcceptOn, setAutoAcceptOn] = useState(false);
  const [minAutoAccept, setMinAutoAccept] = useState("");

  const [items, setItems] = useState<PhotoItem[]>([]);
  const [finalPhotos, setFinalPhotos] = useState<string[]>([]);
  const [studio, setStudio] = useState(false);
  const [studioNote, setStudioNote] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const named = rows.filter((r) => r.name.trim().length > 0);
  const totalPieces = named.reduce(
    (n, r) => n + (Number(r.quantity) > 0 ? Math.floor(Number(r.quantity)) : 0),
    0,
  );
  const priceCents = Math.round((Number(price) || 0) * 100);

  function patchRow(key: number, patch: Partial<LotRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow(nextKey.current++)]);
  }
  function removeRow(key: number) {
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((r) => r.key !== key)));
  }

  async function materialize(): Promise<string[]> {
    setPhotoBusy(true);
    try {
      const result = await materializePhotos(items, studio);
      setItems(result.items);
      setFinalPhotos(result.urls);
      setStudioNote(result.note);
      return result.urls;
    } finally {
      setPhotoBusy(false);
    }
  }

  // Mirrors lotSchema (src/lib/validation.ts) so every reject the server would
  // throw is caught here, before photos upload.
  function validate(): string | null {
    if (title.trim().length < 1) return "Give the lot a title.";
    if (title.trim().length > 160) return "Title is too long (160 characters max).";
    if (!CATEGORIES.some((c) => c.slug === categorySlug)) return "Pick a category.";
    if (named.length < 1) return "Add at least one item to the lot.";
    if (named.length > 80) return "Up to 80 line items per lot.";
    if (totalPieces < 2) return "A lot needs at least 2 items in total.";
    if (!condition) return "Pick a condition.";
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0)
      return "Set a price greater than $0.";
    if (priceNum > 1_000_000) return "Price must be $1,000,000 or less.";
    if (description.length > 4000)
      return "Description is too long (4,000 characters max).";
    for (const r of named) {
      if (r.name.trim().length > 160)
        return `"${r.name.trim().slice(0, 30)}…": name is too long (160 characters max).`;
      const q = Number(r.quantity);
      if (!Number.isInteger(q) || q < 1 || q > 999)
        return `"${r.name}": quantity must be a whole number from 1 to 999.`;
    }
    if (autoAcceptOn) {
      const floor = Number(minAutoAccept);
      if (!minAutoAccept.trim() || !Number.isFinite(floor) || floor <= 0)
        return "Set a minimum auto-accept price, or turn auto-accept off.";
    }
    return null;
  }

  async function submit(intent: "draft" | "post") {
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      let photos = finalPhotos;
      if (items.length > 0) {
        try {
          photos = await materialize();
        } catch (e) {
          setErr(
            e instanceof Error ? e.message : "Photo upload failed. Try again.",
          );
          setBusy(false);
          return;
        }
      } else {
        // Every photo was removed — don't let previously materialized URLs
        // ride along into the post.
        photos = [];
        setFinalPhotos([]);
      }

      const payloadItems = named.map((r) => ({
        name: r.name.trim(),
        quantity: Number(r.quantity) > 0 ? Math.floor(Number(r.quantity)) : 1,
      }));

      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("categorySlug", categorySlug);
      fd.append("description", description);
      fd.append("condition", condition);
      fd.append("price", price);
      // JSON, not comma-joined — URLs and names may legally contain commas.
      fd.append("photos", JSON.stringify(photos));
      fd.append("items", JSON.stringify(payloadItems));
      fd.append("intent", intent);
      fd.append(
        "minAutoAccept",
        autoAcceptOn && minAutoAccept ? minAutoAccept : "",
      );
      // Redirects on success (throws NEXT_REDIRECT); returns {error} when the
      // server-side schema rejects, so the seller keeps their typed input.
      const res = await createLot(fd);
      if (res?.error) {
        setErr(res.error);
        setBusy(false);
      }
    } catch (e) {
      if (isNextRedirectError(e)) throw e;
      setErr(e instanceof Error ? e.message : "Could not save the lot.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-3xl">List a lot</h1>
          <Link
            href="/sell"
            className="text-sm font-semibold !text-[var(--tnt-red)]"
          >
            ← Sell a single item
          </Link>
        </div>
        <p className="text-muted text-sm">
          {userName ? `Hi ${userName}. ` : ""}Selling a bundle? Group several
          items into one lot for one price — a mix of different things, or
          multiples of the same.
        </p>
      </div>

      <div className="tnt-panel p-6 space-y-5">
        <Field label="Lot title">
          <input
            className="tnt-input"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Box of 30 vintage band tees, mixed sizes"
          />
        </Field>

        <Field label="Category">
          <select
            className="tnt-input"
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
          >
            <option value="">Select…</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted mt-1">
            The closest fit for the bundle as a whole — it&apos;s where buyers
            will find it.
          </p>
        </Field>

        {/* Contents builder */}
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">What&apos;s in the lot?</span>
            <span className="text-xs text-muted">
              {totalPieces} {totalPieces === 1 ? "item" : "items"}
              {named.length > 0
                ? ` · ${named.length} ${named.length === 1 ? "line" : "lines"}`
                : ""}
            </span>
          </div>

          {rows.map((row, i) => (
            <div key={row.key} className="flex gap-2 items-start">
              <label className="flex-1 min-w-0">
                <span className="sr-only">Item {i + 1}</span>
                <input
                  className="tnt-input"
                  value={row.name}
                  maxLength={160}
                  placeholder={
                    i === 0
                      ? "e.g. Nirvana Nevermind tee, size L"
                      : "Another item in the lot"
                  }
                  onChange={(e) => patchRow(row.key, { name: e.target.value })}
                />
              </label>
              <label className="shrink-0">
                <span className="sr-only">Quantity</span>
                <input
                  className="tnt-input w-16 text-center"
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  value={row.quantity}
                  onChange={(e) =>
                    patchRow(row.key, { quantity: e.target.value })
                  }
                  aria-label={`Quantity of ${row.name || "this item"}`}
                />
              </label>
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                disabled={rows.length <= 1}
                aria-label="Remove this item"
                className="shrink-0 w-9 h-9 grid place-items-center rounded-lg border-2 border-[var(--tnt-line-strong)] text-lg leading-none text-muted hover:text-[var(--tnt-red)] hover:border-[var(--tnt-red)] disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="tnt-btn tnt-btn--ghost !py-1.5 !px-3 !text-sm"
          >
            + Add another item
          </button>
          <p className="text-xs text-muted">
            One line per kind of item; set the quantity for multiples of the
            same thing. A lot needs at least 2 items in total.
          </p>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-semibold">Overall condition</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            {CONDITIONS.map((c) => {
              const selected = condition === c.value;
              return (
                <label
                  key={c.value}
                  className={`flex items-start gap-2 rounded-2xl border-2 p-3 cursor-pointer transition-colors hover:border-[var(--tnt-purple)] ${
                    selected
                      ? "border-[var(--tnt-purple)] bg-[var(--tnt-purple-soft)]"
                      : "border-[var(--tnt-line-strong)] bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="lot-condition"
                    className="mt-1"
                    value={c.value}
                    checked={selected}
                    onChange={() => setCondition(c.value)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">
                      {c.label}
                    </span>
                    <span className="block text-xs text-muted">{c.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            Describes the bundle as a whole — call out anything that differs in
            the description.
          </p>
        </fieldset>

        <Field label="Description (optional)">
          <textarea
            className="tnt-input"
            rows={4}
            value={description}
            maxLength={4000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Sizes, flaws, what's included, why you're selling as a lot…"
          />
        </Field>

        <Field label="Whole-lot price (USD)">
          <input
            className="tnt-input"
            type="number"
            step="0.01"
            min="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>

        <Field label="Photos">
          <PhotoPicker items={items} onChange={setItems} disabled={photoBusy} />
          <label className="mt-3 flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={studio}
              disabled={photoBusy}
              onChange={(e) => {
                setStudio(e.target.checked);
                setStudioNote("");
              }}
            />
            <div className="space-y-0.5">
              <p className="text-sm text-ink font-semibold">
                📸 Studio-optimize photos
                {photoBusy && (
                  <span className="ml-2 text-xs font-normal text-muted">
                    Uploading &amp; optimizing…
                  </span>
                )}
              </p>
              <p className="text-muted text-xs">
                Cleans up the background and adds a soft drop shadow. Applied
                when your photos upload.
              </p>
              {studioNote && (
                <p className="text-xs font-medium text-[var(--tnt-ink-soft)]">
                  {studioNote}
                </p>
              )}
            </div>
          </label>
        </Field>

        <div className="tnt-panel p-4 space-y-2 border border-[var(--tnt-line)]">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={autoAcceptOn}
              onChange={(e) => setAutoAcceptOn(e.target.checked)}
            />
            <div className="space-y-1">
              <p className="text-sm text-ink font-semibold">
                Auto-accept offers above a minimum
              </p>
              <p className="text-muted text-xs">
                Any offer at or above your floor turns into an order instantly.
                Buyers can make offers on lots just like single items.
              </p>
            </div>
          </label>
          {autoAcceptOn && (
            <Field label="Minimum auto-accept price (USD)">
              <input
                className="tnt-input"
                type="number"
                step="0.01"
                min="1"
                value={minAutoAccept}
                onChange={(e) => setMinAutoAccept(e.target.value)}
                placeholder="e.g. 120.00"
              />
            </Field>
          )}
        </div>

        {/* Live summary */}
        <div className="tnt-panel tnt-panel--accent p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">
              This lot
            </p>
            <p className="text-sm text-ink">
              {totalPieces} {totalPieces === 1 ? "item" : "items"}
              {named.length > 1 ? ` · ${named.length} lines` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">
              Price
            </p>
            <p className="font-display text-2xl font-semibold text-[var(--tnt-red)]">
              {priceCents > 0 ? formatCents(priceCents) : "—"}
            </p>
          </div>
        </div>

        {err && <p className="text-red-600 text-sm">{err}</p>}

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            onClick={() => submit("draft")}
            disabled={busy || photoBusy}
            className="tnt-btn tnt-btn--ghost flex-1 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save as draft"}
          </button>
          <button
            type="button"
            onClick={() => submit("post")}
            disabled={busy || photoBusy}
            className="tnt-btn flex-1 disabled:opacity-60"
          >
            {busy
              ? "Posting…"
              : photoBusy
                ? "Uploading photos…"
                : "Post lot"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
