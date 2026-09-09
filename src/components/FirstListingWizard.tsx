"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PhotoPicker,
  materializePhotos,
  type PhotoItem,
} from "@/components/PhotoPicker";
import { BeanieCombobox } from "@/components/BeanieCombobox";
import { createListing } from "@/app/sell/actions";
import { formatCents } from "@/lib/fees";
import {
  LISTING_CONDITIONS,
  canonicalCondition,
  HANG_TAG_OPTIONS,
  type HangTagOption,
  withHangTagLine,
} from "@/lib/listingOptions";
import { isNextRedirectError } from "@/lib/nextRedirect";
import type { BeanieEntry } from "@/lib/beanie-types";

// Guided first-listing wizard: one decision per step, everything optional
// stripped out. Publishes with the same server action + schema as the full
// Sell form — defaults cover the rest (quantity 1, sold as-is, no
// auto-accept), all editable later from the listing's Edit page.

const STEPS = ["Photos", "Beanie", "Condition", "Price"] as const;

type HangTag = "" | HangTagOption;

export function FirstListingWizard({ userName }: { userName?: string | null }) {
  const [step, setStep] = useState(0);
  const [beanieName, setBeanieName] = useState("");
  const [year, setYear] = useState("");
  const [hangTag, setHangTag] = useState<HangTag>("");
  const [condition, setCondition] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [linkedBeanie, setLinkedBeanie] = useState<BeanieEntry | null>(null);

  const [items, setItems] = useState<PhotoItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Set once the photo step's AI pass filled anything — surfaces a "check our
  // guesses" note on the steps that follow.
  const [aiFilled, setAiFilled] = useState(false);
  const [aiPriceNote, setAiPriceNote] = useState("");
  const [descBusy, setDescBusy] = useState(false);
  const [descNote, setDescNote] = useState("");

  function go(next: number) {
    setErr("");
    setStep(next);
    // Steps are short, but on phones the wizard can sit below the header.
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  // Leave the photo step: upload whatever was added, and — when the seller
  // hasn't named the beanie yet — let AI draft the empty fields from the
  // photos. AI is best-effort: any failure just means the steps start blank.
  async function continueFromPhotos() {
    if (items.length === 0) {
      go(1);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      let urls: string[];
      try {
        const result = await materializePhotos(items, false);
        setItems(result.items);
        urls = result.urls;
      } catch (e) {
        setErr(
          e instanceof Error ? e.message : "Photo upload failed. Try again.",
        );
        return;
      }
      if (urls.length > 0 && beanieName.trim() === "") {
        try {
          const res = await fetch("/api/listing-assist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photos: urls, hint: "" }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.suggestion) {
            const s = data.suggestion;
            const aiName: string = s.beanieName || s.title || "";
            if (aiName) {
              setBeanieName(aiName);
              // Resolve the AI's guess to a catalogue entry server-side, the
              // same way the combobox will as the seller types.
              try {
                const r = await fetch(
                  `/api/beanies/suggest?q=${encodeURIComponent(aiName)}`,
                );
                if (r.ok) {
                  const linked: BeanieEntry | null =
                    (await r.json()).linked ?? null;
                  setLinkedBeanie(linked);
                  if (linked?.year) setYear((cur) => cur || String(linked.year));
                }
              } catch {
                // non-fatal — the seller confirms the name on the next step
              }
            }
            if (s.year) setYear((cur) => cur || String(s.year));
            const cond = canonicalCondition(s.condition);
            if (cond) setCondition((cur) => cur || cond);
            if (s.description)
              setDescription((cur) => cur || String(s.description));
            if (s.recommendedPrice) {
              setPrice((cur) => cur || String(s.recommendedPrice));
              const ebay = data.ebayComps;
              setAiPriceNote(
                s.priceSource === "ebay_sold_median" && ebay?.median
                  ? `Suggested from recent eBay sold prices (median $${Math.round(ebay.median)}${ebay.count ? `, ${ebay.count} sales` : ""}).`
                  : "Suggested by AI from your photos — set any price you like.",
              );
            }
            setAiFilled(Boolean(aiName || s.condition || s.recommendedPrice));
          }
        } catch {
          // best-effort only — never block the wizard on the AI pass
        }
      }
      go(1);
    } finally {
      setBusy(false);
    }
  }

  // Writes the description from the details already entered — same endpoint
  // the full form uses.
  async function generateDescription() {
    setDescBusy(true);
    setDescNote("");
    try {
      const res = await fetch("/api/listing-describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beanieName,
          year,
          condition,
          hangTag,
          description,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.description) {
        setDescription(data.description);
        setDescNote("AI-written from your details — tweak anything you like.");
      } else {
        setDescNote(data?.error || "Couldn't write one just now. Try again.");
      }
    } catch {
      setDescNote("Couldn't write one just now. Try again.");
    } finally {
      setDescBusy(false);
    }
  }

  function validatePrice(): string | null {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return "Set a price greater than $0.";
    if (n > 1_000_000) return "Price must be $1,000,000 or less.";
    if (year.trim() !== "") {
      const y = Number(year);
      if (!Number.isInteger(y) || y < 1980 || y > 2100)
        return "Year should be a full 4-digit year, e.g. 1997.";
    }
    // "Hang tag: …" is prepended on submit — leave headroom under the
    // server's 4,000-character cap.
    if (description.length > 3950)
      return "Description is too long (4,000 characters max).";
    return null;
  }

  async function publish() {
    const v = validatePrice();
    if (v) {
      setErr(v);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      // Photos were uploaded when leaving the photo step; re-materializing is
      // a no-op that just re-derives the URL list from the current items (so
      // photos removed after going back never ride along).
      let urls: string[] = [];
      if (items.length > 0) {
        try {
          const result = await materializePhotos(items, false);
          setItems(result.items);
          urls = result.urls;
        } catch (e) {
          setErr(
            e instanceof Error ? e.message : "Photo upload failed. Try again.",
          );
          setBusy(false);
          return;
        }
      }

      const fd = new FormData();
      fd.append("title", beanieName);
      fd.append("beanieName", beanieName);
      fd.append("year", year);
      fd.append("condition", condition);
      fd.append("description", withHangTagLine(hangTag, description));
      fd.append("price", price);
      fd.append("quantity", "1");
      fd.append("authType", "UNAUTHENTICATED");
      fd.append("trueBlueCertId", "");
      fd.append("coaImageUrl", "");
      fd.append("photos", JSON.stringify(urls));
      fd.append("intent", "post");
      fd.append("minAutoAccept", "");
      fd.append("source", "first");
      // Redirects to the first-sale success screen on success (throws
      // NEXT_REDIRECT); returns {error} when the server-side schema rejects.
      // On success `busy` stays true so the button can't be re-clicked while
      // the navigation is in flight (a re-click would publish a duplicate).
      const res = await createListing(fd);
      if (res?.error) {
        setErr(res.error);
        setBusy(false);
      }
    } catch (e) {
      // redirect() throws NEXT_REDIRECT — let it propagate.
      if (isNextRedirectError(e)) throw e;
      setErr(e instanceof Error ? e.message : "Could not publish the listing");
      setBusy(false);
    }
  }

  const priceCents = Math.round((Number(price) || 0) * 100);
  const coverPreview = items[0]?.previewUrl ?? null;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-3xl">Add your first listing</h1>
        <p className="text-muted text-sm">
          {userName ? `Hi ${userName} — this` : "This"} takes about two
          minutes, and you can edit everything later.
        </p>
      </div>

      <div className="flex items-center justify-center gap-3">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`bx-step ${
                  i === step ? "bx-step--active" : i < step ? "bx-step--done" : ""
                }`}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span
                className={`text-xs ${i === step ? "text-ink" : "text-muted"}`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-8 h-px bg-[var(--bx-line)]" />
            )}
          </div>
        ))}
      </div>

      <div className="bx-panel p-6 space-y-4">
        {step === 0 && (
          <>
            <StepHeading
              title="Snap a few photos"
              sub="Phone photos are perfect. Add the hang tag and tush tag if you can — then AI drafts the rest of the listing for you."
            />
            <PhotoPicker items={items} onChange={setItems} disabled={busy} />
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => go(1)}
                disabled={busy}
                className="text-sm text-muted hover:!text-ink disabled:opacity-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={continueFromPhotos}
                disabled={busy}
                className="bx-btn disabled:opacity-60"
              >
                {busy
                  ? items.length > 0
                    ? "Uploading & reading your photos…"
                    : "One moment…"
                  : items.length > 0
                    ? "Continue →"
                    : "Continue without photos →"}
              </button>
            </div>
            {items.length === 0 && (
              <p className="text-xs text-muted text-right">
                Listings with photos sell far more often — you can also add
                them later.
              </p>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <StepHeading
              title="Which beanie is it?"
              sub="Start typing and pick from the catalogue — that links your listing to collector info and price history. A custom name is fine too."
            />
            {aiFilled && (
              <p className="text-xs font-medium text-[var(--bx-purple-text)]">
                ✨ We read your photos and filled in our best guesses — please
                confirm or correct them.
              </p>
            )}
            <BeanieCombobox
              value={beanieName}
              ariaLabel="Beanie name"
              placeholder="e.g. Princess"
              onChange={(name, linked) => {
                setLinkedBeanie(linked);
                setBeanieName(name);
                // Fill the intro year only when it's still empty — never
                // clobber one the seller typed or the AI already set.
                if (linked?.year) setYear((cur) => cur || String(linked.year));
              }}
            />
            {linkedBeanie && (
              <div
                className="bx-panel p-4 space-y-1"
                style={{
                  background: "var(--bx-green-soft)",
                  borderColor: "var(--bx-green)",
                }}
              >
                <p className="text-sm font-semibold text-[var(--bx-green)]">
                  ✓ Found it: {linkedBeanie.name}
                </p>
                <p className="text-muted text-xs">
                  {linkedBeanie.animal} · {linkedBeanie.category}
                  {linkedBeanie.year ? ` · Introduced ${linkedBeanie.year}` : ""}
                  {linkedBeanie.birthday
                    ? ` · Birthday ${linkedBeanie.birthday}`
                    : ""}
                </p>
                {linkedBeanie.valueLow != null &&
                  linkedBeanie.valueHigh != null && (
                    <p className="text-muted text-xs">
                      Catalogue value (excellent condition, clean tag): $
                      {linkedBeanie.valueLow}–${linkedBeanie.valueHigh}
                    </p>
                  )}
              </div>
            )}
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Year (optional)</span>
              <input
                className="bx-input"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="1997"
              />
            </label>
            <StepNav
              onBack={() => go(0)}
              onNext={() => go(2)}
              nextDisabled={beanieName.trim().length < 2}
              nextTitle={
                beanieName.trim().length < 2
                  ? "Add the beanie's name first"
                  : undefined
              }
            />
          </>
        )}

        {step === 2 && (
          <>
            <StepHeading
              title="What condition is it in?"
              sub="Honest grading builds buyer trust — and better reviews."
            />
            <div className="space-y-1.5">
              <span className="text-sm font-semibold">
                Hang tag (the heart-shaped paper tag)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {HANG_TAG_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setHangTag(t)}
                    className={`bx-badge justify-center py-2 ${
                      hangTag === t ? "bx-badge--on !text-white" : ""
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Overall condition</span>
              <select
                className="bx-input"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              >
                <option value="">Select…</option>
                {LISTING_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value}
                  </option>
                ))}
              </select>
              {condition && (
                <p className="text-xs text-muted">
                  {LISTING_CONDITIONS.find((c) => c.value === condition)?.hint}
                </p>
              )}
            </label>
            <StepNav
              onBack={() => go(1)}
              onNext={() => go(3)}
              nextDisabled={!hangTag || !condition}
              nextTitle={
                !hangTag
                  ? "Pick the hang tag condition first"
                  : !condition
                    ? "Pick the overall condition first"
                    : undefined
              }
            />
          </>
        )}

        {step === 3 && (
          <>
            <StepHeading
              title="Set your price"
              sub="Payment is held in escrow and released to you when the buyer confirms delivery — you're protected on every sale."
            />
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Price (USD)</span>
              <input
                className="bx-input"
                type="number"
                step="0.01"
                min="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="25.00"
              />
            </label>
            {aiPriceNote && (
              <p className="text-xs font-medium text-[var(--bx-ink-soft)]">
                ✨ {aiPriceNote}
              </p>
            )}
            {linkedBeanie?.valueLow != null &&
              linkedBeanie?.valueHigh != null && (
                <p className="text-xs text-muted">
                  Catalogue value for {linkedBeanie.name} in excellent
                  condition: ${linkedBeanie.valueLow}–${linkedBeanie.valueHigh}.
                </p>
              )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  Description (optional)
                </span>
                <button
                  type="button"
                  onClick={generateDescription}
                  disabled={descBusy || beanieName.trim().length < 2}
                  className="text-xs font-semibold text-[var(--bx-purple)] hover:opacity-80 disabled:opacity-50"
                >
                  {descBusy ? "Writing…" : "✨ Let AI write it"}
                </button>
              </div>
              <textarea
                className="bx-input"
                rows={3}
                maxLength={3950}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Anything a buyer would want to know — story, flaws, smoke-free home…"
              />
              {descNote && (
                <p className="text-xs font-medium text-[var(--bx-ink-soft)]">
                  {descNote}
                </p>
              )}
            </div>

            {/* Compact preview — the confidence check before the button. */}
            <div className="bx-panel p-4 flex items-center gap-4">
              {coverPreview ? (
                // Local object URLs can't go through next/image
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverPreview}
                  alt={beanieName || "Your beanie"}
                  className="h-16 w-16 rounded-lg object-cover border border-[var(--bx-line)] shrink-0"
                />
              ) : (
                <span className="h-16 w-16 rounded-lg border border-dashed border-[var(--bx-line-strong)] grid place-items-center text-[10px] text-muted shrink-0">
                  no photo
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">
                  {beanieName || "(Your beanie)"}
                </p>
                <p className="text-xs text-muted truncate">
                  {condition ? condition.split(" — ")[0] : "—"} · Hang tag:{" "}
                  {hangTag || "—"}
                  {year ? ` · ${year}` : ""}
                </p>
              </div>
              <span className="font-display text-2xl font-semibold text-[var(--bx-red)] shrink-0">
                {priceCents > 0 ? formatCents(priceCents) : "—"}
              </span>
            </div>

            <p className="text-xs text-muted">
              Published with the starter settings: 1 available, sold as-is
              (unauthenticated), offers wait for your approval. Change any of
              this later from your listing&apos;s Edit page.
            </p>

            <StepNav
              onBack={() => go(2)}
              onNext={publish}
              nextLabel={busy ? "Publishing…" : "Publish listing 🎉"}
              nextDisabled={busy || priceCents <= 0}
              nextTitle={priceCents <= 0 ? "Set a price first" : undefined}
              backDisabled={busy}
            />
          </>
        )}

        {err && <p className="text-red-600 text-sm">{err}</p>}
      </div>

      <p className="text-center text-sm text-muted">
        Want photos studio-optimized, multiple quantities, or authentication?{" "}
        <Link href="/sell" className="!text-[var(--bx-green)] font-semibold">
          Use the full listing form
        </Link>
        .
      </p>
    </div>
  );
}

function StepHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-muted text-sm">{sub}</p>
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel = "Continue →",
  nextDisabled = false,
  nextTitle,
  backDisabled = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextTitle?: string;
  backDisabled?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 pt-2">
      <button
        type="button"
        onClick={onBack}
        className="bx-btn bx-btn--ghost"
        disabled={backDisabled}
      >
        ← Back
      </button>
      <button
        type="button"
        onClick={onNext}
        className="bx-btn disabled:opacity-60"
        disabled={nextDisabled}
        title={nextTitle}
      >
        {nextLabel}
      </button>
    </div>
  );
}
