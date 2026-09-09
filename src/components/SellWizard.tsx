"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  PhotoPicker,
  materializePhotos,
  type PhotoItem,
} from "@/components/PhotoPicker";
import { AuthBadge } from "@/components/AuthBadge";
import { TrueBlueBadge } from "@/components/TrueBlueBadge";
import { BeanieCombobox } from "@/components/BeanieCombobox";
import type { BeanieEntry } from "@/lib/beanie-types";
import { formatCents } from "@/lib/fees";
import {
  LISTING_CONDITIONS,
  canonicalCondition,
  HANG_TAG_OPTIONS,
  type HangTagOption,
  withHangTagLine,
} from "@/lib/listingOptions";
import { isNextRedirectError } from "@/lib/nextRedirect";
import type { AuthType } from "@prisma/client";

type AuthChoice = AuthType;

type FormState = {
  title: string;
  beanieName: string;
  year: string;
  condition: string;
  description: string;
  price: string;
  authType: AuthChoice;
  trueBlueCertId: string;
  coaImageUrl: string;
  autoAcceptOn: boolean;
  minAutoAccept: string;
  quantity: string;
  hangTag: "" | HangTagOption;
};

const EMPTY: FormState = {
  title: "",
  beanieName: "",
  year: "",
  condition: "",
  description: "",
  price: "",
  authType: "UNAUTHENTICATED",
  trueBlueCertId: "",
  coaImageUrl: "",
  autoAcceptOn: false,
  minAutoAccept: "",
  quantity: "1",
  hangTag: "",
};

export function SellWizard({
  userName,
  createListing,
}: {
  userName?: string | null;
  createListing: (formData: FormData) => Promise<{ error: string } | void>;
}) {
  const [step, setStep] = useState<0 | 1>(0);
  const [f, setF] = useState<FormState>(EMPTY);
  // Catalogue entry the typed/selected beanie name resolves to, if any.
  const [linkedBeanie, setLinkedBeanie] = useState<BeanieEntry | null>(null);
  // Photos stay LOCAL until first needed (autofill / preview / post) — see
  // PhotoPicker. `finalPhotos` holds the materialized R2 URLs for the preview
  // and the actual submit.
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [finalPhotos, setFinalPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");

  const [aiDescBusy, setAiDescBusy] = useState(false);
  const [aiDescNote, setAiDescNote] = useState("");

  // Studio-optimize: cut the item out, center it on a photo-studio backdrop,
  // and add a drop shadow. Just a flag until photos are actually needed —
  // nothing uploads when files are picked, so the seller decides BEFORE the
  // upload, and the server applies the studio look during that one pass.
  const [studio, setStudio] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [studioNote, setStudioNote] = useState("");

  // Upload/optimize whatever the current mode needs and return final URLs.
  // Idempotent: already-materialized items are reused, so re-previews after
  // toggling the checkbox only do the missing work.
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

  // Remove a photo from the Preview step. Drops it from the materialized list
  // that gets posted AND from the underlying picker items, so going back to
  // Edit reflects the removal and it's never re-added on the next materialize.
  function removePhoto(url: string) {
    setFinalPhotos((cur) => cur.filter((u) => u !== url));
    setItems((cur) =>
      cur.filter((it) => it.rawUrl !== url && it.studioUrl !== url),
    );
  }

  // Writes the description from the details the seller has already entered
  // (name, year, condition, hang tag) — no photos needed. Hits /api/listing-describe.
  async function generateDescription() {
    if (f.beanieName.trim().length < 2) {
      setAiDescNote("Add the Beanie's name above first.");
      return;
    }
    setAiDescBusy(true);
    setAiDescNote("");
    try {
      const res = await fetch("/api/listing-describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beanieName: f.beanieName,
          year: f.year,
          condition: f.condition,
          hangTag: f.hangTag,
          description: f.description,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiDescNote(data?.error || "Could not generate a description.");
        return;
      }
      if (data.description) {
        set("description", data.description);
        setAiDescNote("AI-written from your details. Review and tweak before publishing.");
      } else {
        setAiDescNote("No description produced. Try again.");
      }
    } catch {
      setAiDescNote("Something went wrong. Try again.");
    } finally {
      setAiDescBusy(false);
    }
  }

  async function autofill() {
    if (items.length === 0) {
      setAiNote("Add at least one photo first.");
      return;
    }
    setAiBusy(true);
    setAiNote("");
    try {
      // First use of the photos — upload (and studio-optimize, if checked) now.
      let urls: string[];
      try {
        urls = await materialize();
      } catch (e) {
        setAiNote(e instanceof Error ? e.message : "Photo upload failed. Try again.");
        return;
      }
      if (urls.length === 0) {
        setAiNote("Photos couldn't be uploaded. Try again.");
        return;
      }
      const res = await fetch("/api/listing-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: urls, hint: f.beanieName || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiNote(data?.error || "Could not generate suggestions.");
        return;
      }
      const s = data.suggestion || {};
      // The AI's image-based name guess is unreliable, so it NEVER overwrites a
      // name the seller already typed — their text is the source of truth for
      // identity + catalogue linking. It only fills the name when the field is
      // still empty, as a starting point to verify. Same for the other fields:
      // auto-fill populates blanks, it doesn't clobber what you've entered.
      const aiName: string = s.beanieName || s.title || "";
      const nameEntered = f.beanieName.trim().length > 0;
      if (!nameEntered && aiName) {
        // Resolve the AI's name guess to a catalogue entry server-side (keeps
        // the catalogue out of this client bundle).
        try {
          const r = await fetch(
            `/api/beanies/suggest?q=${encodeURIComponent(aiName)}`,
          );
          if (r.ok) setLinkedBeanie((await r.json()).linked ?? null);
        } catch {
          // non-fatal — the seller can still pick from the combobox
        }
      }
      setF((cur) => ({
        ...cur,
        beanieName: nameEntered ? cur.beanieName : aiName || cur.beanieName,
        year: cur.year || (s.year ? String(s.year) : ""),
        // The photo pass returns free text ("Mint with mint tag"); the
        // Condition <select> can only show a canonical value, and storing
        // anything else makes the listing unsavable on the edit page later.
        condition: cur.condition || canonicalCondition(s.condition),
        description: cur.description || s.description || "",
        price: cur.price || (s.recommendedPrice ? String(s.recommendedPrice) : ""),
      }));
      const ebay = data.ebayComps;
      const ebayStr =
        ebay && ebay.median
          ? ` eBay sold comps: median $${Math.round(ebay.median)}${
              ebay.count ? ` (${ebay.count} sales)` : ""
            }.`
          : "";
      const priceStr =
        s.priceSource === "ebay_sold_median"
          ? " Suggested price is the eBay sold median."
          : "";
      setAiNote(
        (nameEntered
          ? `Kept your name “${f.beanieName.trim()}” and filled the empty fields from your photos. `
          : `Drafted empty fields from your photos — type/confirm the beanie name to link the catalogue. `) +
          `(AI confidence: ${s.confidence || "?"}.) Review before publishing.` +
          ebayStr +
          priceStr +
          (s.notes ? ` Note: ${s.notes}` : ""),
      );
    } catch {
      setAiNote("Something went wrong. Try again.");
    } finally {
      setAiBusy(false);
    }
  }

  function validate(): string | null {
    if (f.beanieName.trim().length < 2) return "Add the Beanie's name.";
    if (!f.hangTag) return "Select the hang tag condition.";
    if (f.condition.trim().length < 1) return "Describe the condition.";
    const priceNum = Number(f.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0)
      return "Set a price greater than $0.";
    // Mirror the server schema so every reject the server would throw is
    // caught here, before photos upload (the buttons are type="button", so
    // native min/max attributes never run).
    if (priceNum > 1_000_000) return "Price must be $1,000,000 or less.";
    if (f.year.trim() !== "") {
      const y = Number(f.year);
      if (!Number.isInteger(y) || y < 1980 || y > 2100)
        return "Year should be a full 4-digit year, e.g. 1997.";
    }
    if (f.quantity.trim() !== "") {
      const q = Number(f.quantity);
      if (!Number.isInteger(q) || q < 1 || q > 999)
        return "Quantity must be a whole number from 1 to 999.";
    }
    // The description gets "Hang tag: …" prepended on submit — leave headroom.
    if (f.description.length > 3950)
      return "Description is too long (4,000 characters max).";
    if (
      f.authType === "THIRD_PARTY_COA" &&
      f.coaImageUrl.trim() !== "" &&
      !/^https?:\/\//i.test(f.coaImageUrl.trim())
    )
      return "COA image URL must start with http:// or https://.";
    return null;
  }

  async function goPreview() {
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    setErr("");
    // Materialize photos now so the preview shows exactly what gets posted —
    // including the studio look when the checkbox is on. When the seller has
    // removed every photo, clear the previously materialized URLs too, or the
    // deleted photos would silently ride along into the post.
    if (items.length > 0) {
      try {
        await materialize();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Photo upload failed. Try again.");
        return;
      }
    } else {
      setFinalPhotos([]);
    }
    setStep(1);
  }

  async function submit(intent: "draft" | "post") {
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      // Title and Beanie name are consolidated into one field; send both
      // columns the same value so the existing schema is unchanged.
      fd.append("title", f.beanieName);
      fd.append("beanieName", f.beanieName);
      fd.append("year", f.year);
      fd.append("condition", f.condition);
      fd.append("description", withHangTagLine(f.hangTag, f.description));
      fd.append("price", f.price);
      fd.append("quantity", f.quantity || "1");
      fd.append("authType", f.authType);
      fd.append("trueBlueCertId", f.trueBlueCertId);
      fd.append("coaImageUrl", f.coaImageUrl);
      // JSON array, not comma-joined — URLs may legally contain commas.
      fd.append("photos", JSON.stringify(finalPhotos));
      fd.append("intent", intent);
      fd.append(
        "minAutoAccept",
        f.autoAcceptOn && f.minAutoAccept ? f.minAutoAccept : "",
      );
      // Redirects on success (throws NEXT_REDIRECT); returns {error} when the
      // server-side schema rejects, so the seller keeps their typed input.
      const res = await createListing(fd);
      if (res?.error) {
        setErr(res.error);
        setBusy(false);
      }
    } catch (e) {
      // redirect() throws NEXT_REDIRECT — let it propagate.
      if (isNextRedirectError(e)) throw e;
      setErr(e instanceof Error ? e.message : "Could not save listing");
      setBusy(false);
    }
  }

  const priceCents = Math.round((Number(f.price) || 0) * 100);
  const previewListing = {
    title: f.beanieName || "(Untitled listing)",
    beanieName: f.beanieName || "—",
    year: f.year ? Number(f.year) : null,
    condition: f.condition || "—",
    description: f.description,
    authType: f.authType,
    trueBlueCertId: f.authType === "TRUE_BLUE" ? f.trueBlueCertId : null,
    coaImageUrl: f.authType === "THIRD_PARTY_COA" ? f.coaImageUrl : null,
    photos: finalPhotos,
    priceCents,
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl">List a Beanie</h1>
          {userName && (
            <p className="text-muted text-sm">Hi {userName}.</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold text-muted">
          <Step n={1} label="Details" active={step === 0} done={step > 0} />
          <span className="w-8 h-px bg-[var(--tnt-line-strong)]" />
          <Step n={2} label="Preview" active={step === 1} done={false} />
        </div>
      </div>

      {step === 0 && (
        <Link
          href="/sell/lot"
          className="tnt-panel p-4 flex items-center justify-between gap-3 hover:-translate-y-0.5 transition-transform"
          style={{
            background: "var(--tnt-purple-soft)",
            borderColor: "var(--tnt-purple)",
          }}
        >
          <span className="text-sm">
            <span className="font-bold text-[var(--tnt-purple-text)]">
              🎁 Selling a bundle?
            </span>{" "}
            <span className="text-ink">
              Group many beanies into one Lot for a single price.
            </span>
          </span>
          <span className="font-semibold text-[var(--tnt-purple-text)] shrink-0">
            Create a Lot →
          </span>
        </Link>
      )}

      {step === 0 && (
        <>
          <div className="tnt-panel p-6 space-y-4">
            <Field label="Start with photos — let AI do the rest">
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
                    Centers the beanie, removes the background, and adds a soft
                    drop shadow so every shot looks like a photo studio.
                    Applied when your photos upload — you&apos;ll see the
                    result in the preview. Uncheck and preview again to use
                    your originals.
                  </p>
                  {studioNote && (
                    <p className="text-xs font-medium text-[var(--tnt-ink-soft)]">
                      {studioNote}
                    </p>
                  )}
                </div>
              </label>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={autofill}
                  disabled={aiBusy || photoBusy || items.length === 0}
                  className="tnt-btn tnt-btn--purple !py-2 disabled:opacity-50"
                >
                  {aiBusy ? "Analyzing photos…" : "✨ Auto-fill listing from photos"}
                </button>
                <p className="mt-1.5 text-xs text-muted">
                  AI identifies your beanie and drafts the title, condition,
                  description, and a suggested price from your photos. Always
                  review before publishing.
                </p>
                {aiNote && (
                  <p className="mt-2 text-xs font-medium text-[var(--tnt-ink-soft)]">
                    {aiNote}
                  </p>
                )}
              </div>
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Beanie name (used as the listing title)">
                <BeanieCombobox
                  value={f.beanieName}
                  placeholder="Search the catalogue — e.g. Princess"
                  onChange={(name, linked) => {
                    setLinkedBeanie(linked);
                    setF((cur) => ({
                      ...cur,
                      beanieName: name,
                      // Fill the intro year only when the seller hasn't set one
                      // — never clobber a year they typed. This handler also
                      // fires on every background re-resolve as they type, so an
                      // unconditional assign would reset a corrected year.
                      year: cur.year || (linked?.year ? String(linked.year) : ""),
                    }));
                  }}
                />
              </Field>
              <Field label="Year (optional)">
                <input
                  className="tnt-input"
                  type="number"
                  value={f.year}
                  onChange={(e) => set("year", e.target.value)}
                  placeholder="1997"
                />
              </Field>
            </div>
            {linkedBeanie && (
              <div
                className="tnt-panel p-4 space-y-1"
                style={{
                  background: "var(--tnt-green-soft)",
                  borderColor: "var(--tnt-green)",
                }}
              >
                <p className="text-sm font-semibold text-[var(--tnt-green)]">
                  ✓ Linked to the BX catalogue: {linkedBeanie.name}
                </p>
                <p className="text-muted text-xs">
                  {linkedBeanie.animal} · {linkedBeanie.category}
                  {linkedBeanie.styleNumber
                    ? ` · Style #${linkedBeanie.styleNumber}`
                    : ""}
                  {linkedBeanie.birthday
                    ? ` · Birthday ${linkedBeanie.birthday}`
                    : ""}
                  {linkedBeanie.year ? ` · Introduced ${linkedBeanie.year}` : ""}
                </p>
                {linkedBeanie.valueLow != null && linkedBeanie.valueHigh != null && (
                  <p className="text-muted text-xs">
                    Catalogue value (excellent condition, clean tag): $
                    {linkedBeanie.valueLow}–${linkedBeanie.valueHigh}
                  </p>
                )}
                {linkedBeanie.note && (
                  <p className="text-muted text-xs italic">{linkedBeanie.note}</p>
                )}
              </div>
            )}
            <Field label="Hang Tag">
              <select
                className="tnt-input"
                value={f.hangTag}
                onChange={(e) =>
                  set("hangTag", e.target.value as FormState["hangTag"])
                }
              >
                <option value="">Select…</option>
                {HANG_TAG_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Condition">
              <select
                className="tnt-input"
                value={f.condition}
                onChange={(e) => set("condition", e.target.value)}
              >
                <option value="">Select…</option>
                {LISTING_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value}
                  </option>
                ))}
              </select>
            </Field>
            <div className="block space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Description</span>
                <button
                  type="button"
                  onClick={generateDescription}
                  disabled={aiDescBusy}
                  title="Generate a description from the details above"
                  aria-label="Generate description with AI"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--tnt-purple)] hover:opacity-80 disabled:opacity-50"
                >
                  <SparkleIcon
                    className={`w-3.5 h-3.5 ${aiDescBusy ? "animate-pulse" : ""}`}
                  />
                  {aiDescBusy ? "Writing…" : "AI generate"}
                </button>
              </div>
              <textarea
                className="tnt-input"
                rows={4}
                maxLength={3950}
                value={f.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Story, condition notes, anything a buyer would want to know."
              />
              {aiDescNote && (
                <p className="text-xs font-medium text-[var(--tnt-ink-soft)]">
                  {aiDescNote}
                </p>
              )}
            </div>
            <Field label="Price (USD)">
              <input
                className="tnt-input"
                type="number"
                step="0.01"
                min="1"
                value={f.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </Field>

            <Field label="Quantity (optional)">
              <input
                className="tnt-input"
                type="number"
                step="1"
                min="1"
                max="999"
                value={f.quantity}
                onChange={(e) => set("quantity", e.target.value)}
              />
              <p className="text-xs text-muted mt-1">
                Have more than one of this exact beanie? List them all at once
                — the listing shows as sold out when the last one sells.
              </p>
            </Field>

            <Field label="Is this beanie authenticated?">
              <select
                className="tnt-input"
                value={f.authType}
                onChange={(e) =>
                  set("authType", e.target.value as AuthChoice)
                }
              >
                <option value="TRUE_BLUE">True Blue verified</option>
                <option value="BX_FULL_SERVICE">BX authenticated</option>
                <option value="THIRD_PARTY_COA">Other (third-party COA)</option>
                <option value="UNAUTHENTICATED">
                  Unauthenticated — sold as-is
                </option>
              </select>
              <p className="text-muted text-sm mt-1">
                Tell buyers how this beanie&apos;s authenticity is backed.
                Unauthenticated items are sold as-is and clearly flagged.
              </p>
              {f.authType === "TRUE_BLUE" && (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-muted">Verified by</span>
                  <TrueBlueBadge size="sm" />
                </div>
              )}
            </Field>

            {f.authType === "TRUE_BLUE" && (
              <Field label="True Blue cert ID">
                <input
                  className="tnt-input"
                  value={f.trueBlueCertId}
                  onChange={(e) => set("trueBlueCertId", e.target.value)}
                  placeholder="TBB-…"
                />
              </Field>
            )}
            {f.authType === "THIRD_PARTY_COA" && (
              <Field label="COA image URL">
                <input
                  className="tnt-input"
                  value={f.coaImageUrl}
                  onChange={(e) => set("coaImageUrl", e.target.value)}
                  placeholder="https://…"
                />
              </Field>
            )}

            <div className="tnt-panel p-4 space-y-2 border border-[var(--tnt-line)]">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={f.autoAcceptOn}
                  onChange={(e) => set("autoAcceptOn", e.target.checked)}
                />
                <div className="space-y-1">
                  <p className="text-sm text-ink font-semibold">
                    Auto-accept offers above a minimum
                  </p>
                  <p className="text-muted text-xs">
                    Any offer at or above your floor turns into an Order
                    instantly — no decision needed from you. Below the floor,
                    offers wait in your dashboard for accept / reject.
                  </p>
                </div>
              </label>
              {f.autoAcceptOn && (
                <Field label="Minimum auto-accept price (USD)">
                  <input
                    className="tnt-input"
                    type="number"
                    step="0.01"
                    min="1"
                    value={f.minAutoAccept}
                    onChange={(e) => set("minAutoAccept", e.target.value)}
                    placeholder="e.g. 85.00"
                  />
                </Field>
              )}
            </div>

            {err && <p className="text-red-600 text-sm">{err}</p>}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={goPreview}
                disabled={photoBusy}
                className="tnt-btn flex-1 disabled:opacity-60"
              >
                {photoBusy
                  ? studio
                    ? "Uploading & optimizing photos…"
                    : "Uploading photos…"
                  : "Preview →"}
              </button>
            </div>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <p className="text-muted text-sm text-center">
            Here&apos;s how your listing will look. Edit if anything&apos;s off,
            save as a draft for later, or post it now.
          </p>

          <article className="tnt-panel p-5 space-y-5">
            {previewListing.photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {previewListing.photos.map((p, i) => (
                  <div
                    key={p + i}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-[var(--tnt-line-strong)] bg-[var(--tnt-surface)]"
                  >
                    <Image
                      src={p}
                      alt={`${previewListing.title} ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, 320px"
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(p)}
                      aria-label={`Remove photo ${i + 1}`}
                      title="Remove this photo"
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-[var(--tnt-ink)]/80 text-white text-base leading-none grid place-items-center hover:bg-[var(--tnt-red)] transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="aspect-video rounded-lg border border-dashed border-[var(--tnt-line-strong)] flex items-center justify-center text-muted text-sm">
                No photos
              </div>
            )}

            <div className="space-y-2">
              <AuthBadge
                authType={previewListing.authType}
                size="lg"
              />
              <h2 className="text-2xl">{previewListing.title}</h2>
              <p className="text-muted text-sm">
                {previewListing.beanieName}
                {previewListing.year ? ` · ${previewListing.year}` : ""} ·{" "}
                {previewListing.condition}
              </p>
              {previewListing.description && (
                <p className="whitespace-pre-wrap text-sm">
                  {previewListing.description}
                </p>
              )}
              {previewListing.trueBlueCertId && (
                <p className="text-sm text-muted">
                  True Blue Cert:{" "}
                  <span className="text-ink font-medium">
                    {previewListing.trueBlueCertId}
                  </span>
                </p>
              )}
              {previewListing.coaImageUrl && (
                <p className="text-sm text-muted">
                  COA:{" "}
                  <span className="text-ink break-all">
                    {previewListing.coaImageUrl}
                  </span>
                </p>
              )}
            </div>

            <div className="border-t border-[var(--tnt-line)] pt-3 flex justify-between items-baseline">
              <span className="text-xs uppercase tracking-wide text-muted font-semibold">
                Listed Price
              </span>
              <span className="font-display text-3xl font-semibold text-[var(--tnt-red)]">
                {priceCents > 0 ? formatCents(priceCents) : "—"}
              </span>
            </div>
          </article>

          {err && <p className="text-red-600 text-sm text-center">{err}</p>}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="tnt-btn tnt-btn--ghost flex-1"
              disabled={busy}
            >
              ← Edit
            </button>
            <button
              type="button"
              onClick={() => submit("draft")}
              className="tnt-btn tnt-btn--ghost flex-1"
              disabled={busy}
            >
              {busy ? "Saving…" : "Save as Draft"}
            </button>
            <button
              type="button"
              onClick={() => submit("post")}
              className="tnt-btn flex-1"
              disabled={busy}
            >
              {busy ? "Posting…" : "Post Listing"}
            </button>
          </div>

          <p className="text-xs text-center text-muted">
            Drafts live in your{" "}
            <Link
              href="/dashboard"
              className="!text-[var(--tnt-red)] font-semibold"
            >
              dashboard
            </Link>{" "}
            and don&apos;t appear in Browse until you post them.
          </p>
        </>
      )}
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

function Step({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`tnt-step ${
          active ? "tnt-step--active" : done ? "tnt-step--done" : ""
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span className={active ? "text-ink" : ""}>{label}</span>
    </span>
  );
}

function SparkleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 2l1.7 5.1a3 3 0 0 0 1.9 1.9L20.7 11l-5.1 1.7a3 3 0 0 0-1.9 1.9L12 19.7l-1.7-5.1a3 3 0 0 0-1.9-1.9L3.3 11l5.1-1.7a3 3 0 0 0 1.9-1.9L12 2z" />
      <path d="M19 14.5l.7 2.1.3.3 2.1.7-2.1.7-.3.3-.7 2.1-.7-2.1-.3-.3-2.1-.7 2.1-.7.3-.3.7-2.1z" opacity="0.75" />
    </svg>
  );
}
