"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  PhotoPicker,
  materializePhotos,
  type PhotoItem,
} from "@/components/PhotoPicker";
import { BeanieCombobox } from "@/components/BeanieCombobox";
import { formatCents } from "@/lib/fees";
import { isNextRedirectError } from "@/lib/nextRedirect";
import type { BeanieEntry } from "@/lib/beanie-types";

type LotAuth = "UNAUTHENTICATED" | "THIRD_PARTY_COA";

type LotRow = {
  key: number;
  beanieName: string;
  year: string;
  styleNumber: string;
  quantity: string;
  linked: BeanieEntry | null;
};

const CONDITIONS = [
  "Mixed — see photos",
  "MWMT — Mint With Mint Tags",
  "NM — Near Mint",
  "EX — Excellent",
  "VG — Very Good",
  "G — Good",
  "P — Poor",
];

function emptyRow(key: number): LotRow {
  return {
    key,
    beanieName: "",
    year: "",
    styleNumber: "",
    quantity: "1",
    linked: null,
  };
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
  const [rows, setRows] = useState<LotRow[]>([emptyRow(0)]);
  const [condition, setCondition] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [authType, setAuthType] = useState<LotAuth>("UNAUTHENTICATED");
  const [coaImageUrl, setCoaImageUrl] = useState("");
  const [autoAcceptOn, setAutoAcceptOn] = useState(false);
  const [minAutoAccept, setMinAutoAccept] = useState("");

  const [items, setItems] = useState<PhotoItem[]>([]);
  const [finalPhotos, setFinalPhotos] = useState<string[]>([]);
  const [studio, setStudio] = useState(false);
  const [studioNote, setStudioNote] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const named = rows.filter((r) => r.beanieName.trim().length > 0);
  const totalPieces = named.reduce(
    (n, r) => n + (Number(r.quantity) > 0 ? Math.floor(Number(r.quantity)) : 0),
    0,
  );
  const priceCents = Math.round((Number(price) || 0) * 100);

  function patchRow(
    key: number,
    patch: Partial<LotRow> | ((r: LotRow) => Partial<LotRow>),
  ) {
    setRows((rs) =>
      rs.map((r) =>
        r.key === key
          ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) }
          : r,
      ),
    );
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

  function validate(): string | null {
    if (title.trim().length < 1) return "Give your lot a title.";
    if (named.length < 1) return "Add at least one beanie to the lot.";
    if (named.length > 80) return "Up to 80 line items per lot.";
    if (totalPieces < 2) return "A lot needs at least 2 beanies in total.";
    if (!condition) return "Select the lot's overall condition.";
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0)
      return "Set a price greater than $0.";
    if (priceNum > 1_000_000) return "Price must be $1,000,000 or less.";
    // Mirror the server schema per row so a typo can't reject the whole lot
    // after the seller has typed dozens of entries.
    for (const r of named) {
      const q = Number(r.quantity);
      if (!Number.isInteger(q) || q < 1 || q > 999)
        return `"${r.beanieName}": quantity must be a whole number from 1 to 999.`;
      if (r.year.trim() !== "") {
        const y = Number(r.year);
        if (!Number.isInteger(y) || y < 1980 || y > 2100)
          return `"${r.beanieName}": year should be a full 4-digit year, e.g. 1997.`;
      }
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
        beanieName: r.beanieName.trim(),
        year: r.year ? Number(r.year) : undefined,
        styleNumber: r.styleNumber || undefined,
        quantity: Number(r.quantity) > 0 ? Math.floor(Number(r.quantity)) : 1,
      }));

      const fd = new FormData();
      fd.append("title", title);
      fd.append("description", description);
      fd.append("condition", condition);
      fd.append("price", price);
      fd.append("authType", authType);
      fd.append("coaImageUrl", authType === "THIRD_PARTY_COA" ? coaImageUrl : "");
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
          <h1 className="text-3xl">List a Lot</h1>
          <Link
            href="/sell"
            className="text-sm font-semibold !text-[var(--tnt-red)]"
          >
            ← Sell a single beanie
          </Link>
        </div>
        <p className="text-muted text-sm">
          {userName ? `Hi ${userName}. ` : ""}Bundle many beanies — a mix of
          different ones, or multiples of the same — into one listing sold
          together for one price.
        </p>
      </div>

      <div className="tnt-panel p-6 space-y-5">
        <Field label="Lot title">
          <input
            className="tnt-input"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 40-piece 1990s Beanie Baby lot — all with tags"
          />
        </Field>

        {/* Contents builder */}
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">What&apos;s in the lot?</span>
            <span className="text-xs text-muted">
              {totalPieces} {totalPieces === 1 ? "beanie" : "beanies"}
              {named.length > 0
                ? ` · ${named.length} ${named.length === 1 ? "type" : "types"}`
                : ""}
            </span>
          </div>

          {rows.map((row, i) => (
            <div key={row.key} className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <BeanieCombobox
                  value={row.beanieName}
                  ariaLabel={`Beanie name for row ${i + 1}`}
                  placeholder="Search a beanie — e.g. Patti"
                  onChange={(name, linked) =>
                    patchRow(row.key, (r) => ({
                      beanieName: name,
                      linked,
                      // Fill the year from the catalogue only when empty (never
                      // clobber). styleNumber always tracks the current link, so
                      // it clears when the name becomes free text.
                      year: r.year || (linked?.year ? String(linked.year) : ""),
                      styleNumber: linked?.styleNumber ?? "",
                    }))
                  }
                />
                {row.linked && (
                  <p className="text-xs text-[var(--tnt-green)] mt-1 truncate">
                    ✓ {row.linked.name}
                    {row.linked.styleNumber
                      ? ` · #${row.linked.styleNumber}`
                      : ""}
                  </p>
                )}
              </div>
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
                  aria-label={`Quantity of ${row.beanieName || "this beanie"}`}
                />
              </label>
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                disabled={rows.length <= 1}
                aria-label="Remove this beanie"
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
            + Add another beanie
          </button>
          <p className="text-xs text-muted">
            Set the quantity for multiples of the same beanie. Catalogue matches
            link automatically — free-typed names are fine too.
          </p>
        </div>

        <Field label="Overall condition">
          <select
            className="tnt-input"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            <option value="">Select…</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Description (optional)">
          <textarea
            className="tnt-input"
            rows={4}
            value={description}
            maxLength={4000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tag condition, any flaws, smoke-free home, why you're selling as a lot…"
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
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
          <Field label="Authentication">
            <select
              className="tnt-input"
              value={authType}
              onChange={(e) => setAuthType(e.target.value as LotAuth)}
            >
              <option value="UNAUTHENTICATED">Unauthenticated — sold as-is</option>
              <option value="THIRD_PARTY_COA">Comes with a third-party COA</option>
            </select>
          </Field>
        </div>
        {authType === "THIRD_PARTY_COA" && (
          <Field label="COA image URL">
            <input
              className="tnt-input"
              value={coaImageUrl}
              onChange={(e) => setCoaImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
        )}

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
                Buyers can make offers on lots just like single beanies.
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
              {totalPieces} {totalPieces === 1 ? "beanie" : "beanies"}
              {named.length > 1 ? ` · ${named.length} types` : ""}
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
            {busy ? "Saving…" : "Save as Draft"}
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
                : "Post Lot"}
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
