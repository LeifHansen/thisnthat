"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  PhotoPicker,
  materializePhotos,
  type PhotoItem,
} from "@/components/PhotoPicker";
import { ConditionBadge } from "@/components/ConditionBadge";
import {
  CATEGORIES,
  attributeEntries,
  getCategory,
  validateAttributes,
  type AttributeField,
  type Attributes,
} from "@/lib/categories";
import { CONDITIONS, canonicalCondition } from "@/lib/listingOptions";
import { PLATFORM_FEE_LABEL, computeSaleFees, formatCents } from "@/lib/fees";
import { canOptimizeImage } from "@/lib/photos";
import { isNextRedirectError } from "@/lib/nextRedirect";
import type { Condition } from "@prisma/client";

// The Sell wizard. Seven small steps instead of one long form: photos first
// (so AI auto-fill can draft the rest), then category, details, the
// category's own attributes, price, shipping, and a preview that posts.
//
// Client-side validation mirrors listingSchema (src/lib/validation.ts) step by
// step so the seller hears about a problem on the step it belongs to, and the
// submit builds FormData exactly as src/app/sell/actions.ts reads it.

const STEPS = [
  "Photos",
  "Category",
  "Details",
  "Attributes",
  "Price",
  "Shipping",
  "Preview",
] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const LAST_STEP = (STEPS.length - 1) as StepIndex;

type FormState = {
  title: string;
  brand: string;
  itemName: string;
  categorySlug: string;
  condition: Condition | "";
  attributes: Attributes;
  description: string;
  price: string;
  quantity: string;
  autoAcceptOn: boolean;
  minAutoAccept: string;
};

const EMPTY: FormState = {
  title: "",
  brand: "",
  itemName: "",
  categorySlug: "",
  condition: "",
  attributes: {},
  description: "",
  price: "",
  quantity: "1",
  autoAcceptOn: false,
  minAutoAccept: "",
};

/**
 * Validate one step the way listingSchema would, returning the first problem.
 * Steps 0 (photos) and 5 (shipping) never block: photos are optional and the
 * ship-from ZIP lives on the profile.
 */
function validateStep(step: StepIndex, f: FormState): string | null {
  switch (step) {
    case 1:
      if (!getCategory(f.categorySlug)) return "Pick a category.";
      return null;
    case 2: {
      if (f.title.trim().length < 1) return "Give the listing a title.";
      if (f.title.trim().length > 160) return "Title is too long (160 characters max).";
      if (f.brand.trim().length > 80) return "Brand is too long (80 characters max).";
      if (f.itemName.trim().length > 160)
        return "Item name is too long (160 characters max).";
      if (!f.condition) return "Pick a condition.";
      if (f.description.length > 4000)
        return "Description is too long (4,000 characters max).";
      return null;
    }
    case 3: {
      const category = getCategory(f.categorySlug);
      if (!category) return "Pick a category.";
      const checked = validateAttributes(category, f.attributes);
      return checked.ok ? null : checked.error;
    }
    case 4: {
      const priceNum = Number(f.price);
      if (!f.price.trim() || !Number.isFinite(priceNum) || priceNum <= 0)
        return "Set a price greater than $0.";
      if (priceNum > 1_000_000) return "Price must be $1,000,000 or less.";
      if (f.quantity.trim() !== "") {
        const q = Number(f.quantity);
        if (!Number.isInteger(q) || q < 1 || q > 999)
          return "Quantity must be a whole number from 1 to 999.";
      }
      if (f.autoAcceptOn) {
        const floor = Number(f.minAutoAccept);
        if (!f.minAutoAccept.trim() || !Number.isFinite(floor) || floor <= 0)
          return "Set a minimum auto-accept price, or turn auto-accept off.";
      }
      return null;
    }
    default:
      return null;
  }
}

/** Every blocking step in order — what the server would reject. */
function validateAll(f: FormState): { step: StepIndex; error: string } | null {
  for (const step of [1, 2, 3, 4] as const) {
    const error = validateStep(step, f);
    if (error) return { step, error };
  }
  return null;
}

export function SellWizard({
  userName,
  shipFromPostalCode,
  canPublish = true,
  createListing,
}: {
  userName?: string | null;
  /** Seller's ship-from ZIP from their profile; null = flat-rate fallback. */
  shipFromPostalCode: string | null;
  /** False when publishing is gated (payouts not enabled): drafts only. */
  canPublish?: boolean;
  createListing: (formData: FormData) => Promise<{ error: string } | void>;
}) {
  const [step, setStep] = useState<StepIndex>(0);
  const [f, setF] = useState<FormState>(EMPTY);
  // Photos stay LOCAL until first needed (autofill / preview / post) — see
  // PhotoPicker. `finalPhotos` holds the materialized R2 URLs for the preview
  // and the actual submit.
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [finalPhotos, setFinalPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }));
  const setAttribute = (key: string, value: string) =>
    setF((s) => ({ ...s, attributes: { ...s.attributes, [key]: value } }));

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

  const category = getCategory(f.categorySlug);

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
  // (title, brand, item, category, condition, attributes) — no photos needed.
  async function generateDescription() {
    if ((f.itemName || f.title).trim().length < 2) {
      setAiDescNote("Add a title or item name above first.");
      return;
    }
    setAiDescBusy(true);
    setAiDescNote("");
    try {
      const res = await fetch("/api/listing-describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.title,
          brand: f.brand,
          itemName: f.itemName,
          categorySlug: f.categorySlug,
          condition: f.condition,
          attributes: f.attributes,
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
      const hint = [f.brand, f.itemName || f.title].filter(Boolean).join(" ");
      const res = await fetch("/api/listing-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: urls, hint }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiNote(data?.error || "Could not generate suggestions.");
        return;
      }
      const s = (data.suggestion ?? {}) as Record<string, unknown>;
      const sStr = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");

      // Auto-fill populates BLANKS only — it never overwrites what the seller
      // typed. The category is pre-selected only when none is chosen yet, and
      // attribute suggestions are kept only when they are valid for the
      // category that ends up selected (their own or the seller's).
      const suggestedSlug = sStr("categorySlug");
      const nextSlug =
        f.categorySlug || (getCategory(suggestedSlug) ? suggestedSlug : "");
      const nextCategory = getCategory(nextSlug);
      const suggestedAttrs =
        s.attributes && typeof s.attributes === "object" && !Array.isArray(s.attributes)
          ? (s.attributes as Record<string, unknown>)
          : {};
      const price = Number(s.recommendedPrice);

      setF((cur) => {
        const attributes: Attributes = { ...cur.attributes };
        if (nextCategory) {
          for (const field of nextCategory.attributes) {
            if (attributes[field.key]) continue;
            const v = String(suggestedAttrs[field.key] ?? "").trim();
            if (!v) continue;
            const one = validateAttributes(nextCategory, { [field.key]: v });
            if (one.ok && one.attributes[field.key]) {
              attributes[field.key] = one.attributes[field.key];
            }
          }
        }
        return {
          ...cur,
          title: cur.title || sStr("title"),
          brand: cur.brand || sStr("brand"),
          itemName: cur.itemName || sStr("itemName"),
          categorySlug: cur.categorySlug || nextSlug,
          // The photo pass may return free text; only a canonical value can be
          // shown by the condition cards and stored on the listing.
          condition: cur.condition || canonicalCondition(s.condition),
          description: cur.description || sStr("description"),
          price:
            cur.price ||
            (Number.isFinite(price) && price > 0 ? String(price) : ""),
          attributes,
        };
      });

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
      const catStr =
        !f.categorySlug && nextCategory
          ? ` Suggested category: ${nextCategory.name} — change it on the next step if that's wrong.`
          : "";
      setAiNote(
        `Filled the empty fields from your photos — anything you'd already typed was kept. ` +
          `(AI confidence: ${sStr("confidence") || "?"}.) Review before publishing.` +
          catStr +
          ebayStr +
          priceStr +
          (sStr("notes") ? ` Note: ${sStr("notes")}` : ""),
      );
    } catch {
      setAiNote("Something went wrong. Try again.");
    } finally {
      setAiBusy(false);
    }
  }

  function goTo(next: StepIndex) {
    setErr("");
    setStep(next);
  }

  function back() {
    if (step > 0) goTo((step - 1) as StepIndex);
  }

  async function next() {
    const problem = validateStep(step, f);
    if (problem) {
      setErr(problem);
      return;
    }
    if (step === LAST_STEP - 1) {
      await goPreview();
      return;
    }
    goTo((step + 1) as StepIndex);
  }

  async function goPreview() {
    // Everything the server checks, before photos upload — so a rejected field
    // is reported on its own step, not after a wasted upload.
    const problem = validateAll(f);
    if (problem) {
      setStep(problem.step);
      setErr(problem.error);
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
    setStep(LAST_STEP);
  }

  async function submit(intent: "draft" | "post") {
    setBusy(true);
    setErr("");
    try {
      const cleaned = category ? validateAttributes(category, f.attributes) : null;
      const fd = new FormData();
      fd.append("title", f.title.trim());
      fd.append("categorySlug", f.categorySlug);
      fd.append("brand", f.brand.trim());
      fd.append("itemName", f.itemName.trim());
      fd.append("condition", f.condition);
      // Flat { key: value } map, JSON-encoded; the action parses it back.
      fd.append(
        "attributes",
        JSON.stringify(cleaned && cleaned.ok ? cleaned.attributes : {}),
      );
      fd.append("description", f.description);
      fd.append("price", f.price);
      fd.append("quantity", f.quantity || "1");
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
  const fees = computeSaleFees(priceCents);
  const previewAttributes = category
    ? attributeEntries(
        category,
        (() => {
          const cleaned = validateAttributes(category, f.attributes);
          return cleaned.ok ? cleaned.attributes : {};
        })(),
      )
    : [];
  const quantityNum = Number(f.quantity) || 1;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-3xl">List an item</h1>
          <p className="text-muted text-sm">
            {userName ? `Hi ${userName}. ` : ""}Anything you own, listed in a
            few minutes.
          </p>
        </div>
        <Stepper step={step} onJump={goTo} />
      </div>

      {!canPublish && (
        <div
          className="tnt-panel p-4 space-y-1"
          style={{ borderColor: "var(--tnt-yellow)" }}
        >
          <p className="text-sm font-bold text-ink">Set up payouts to publish</p>
          <p className="text-muted text-xs">
            You can build this listing and save it as a draft now. It goes live
            once your seller payouts are connected (about two minutes) —{" "}
            <a
              href="/dashboard/payouts"
              target="_blank"
              rel="noreferrer"
              className="font-semibold !text-[var(--tnt-red)]"
            >
              set up payouts
            </a>
            .
          </p>
        </div>
      )}

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
              Group several items into one lot for one price.
            </span>
          </span>
          <span className="font-semibold text-[var(--tnt-purple-text)] shrink-0">
            Create a Lot →
          </span>
        </Link>
      )}

      {/* ── 1. Photos ─────────────────────────────────────────────── */}
      {step === 0 && (
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
                  Centers the item, removes the background, and adds a soft
                  drop shadow so every shot looks like a photo studio. Applied
                  when your photos upload — you&apos;ll see the result in the
                  preview. Uncheck and preview again to use your originals.
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
                {aiBusy ? "Analyzing photos…" : "✨ Auto-fill from photos"}
              </button>
              <p className="mt-1.5 text-xs text-muted">
                AI identifies what you&apos;re selling and drafts the title,
                category, condition, description, and a suggested price from
                your photos. It only fills fields you&apos;ve left blank.
                Always review before publishing.
              </p>
              {aiNote && (
                <p className="mt-2 text-xs font-medium text-[var(--tnt-ink-soft)]">
                  {aiNote}
                </p>
              )}
            </div>
          </Field>
          <p className="text-xs text-muted">
            Photos are optional, but listings with real photos sell faster and
            rank higher in Browse.
          </p>
        </div>
      )}

      {/* ── 2. Category ───────────────────────────────────────────── */}
      {step === 1 && (
        <div className="tnt-panel p-6 space-y-4">
          <div>
            <p className="text-sm font-semibold">What kind of thing is it?</p>
            <p className="text-xs text-muted">
              Pick the closest fit — it decides which details we ask for next
              and where buyers find it.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CATEGORIES.map((c) => {
              const selected = c.slug === f.categorySlug;
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => {
                    set("categorySlug", c.slug);
                    goTo(2);
                  }}
                  aria-pressed={selected}
                  className={`text-left rounded-2xl border-2 p-3 space-y-1 transition-colors hover:border-[var(--tnt-purple)] ${
                    selected
                      ? "border-[var(--tnt-purple)] bg-[var(--tnt-purple-soft)]"
                      : "border-[var(--tnt-line-strong)] bg-white"
                  }`}
                >
                  <span className="block text-2xl" aria-hidden>
                    {c.emoji}
                  </span>
                  <span className="block font-semibold text-sm text-ink">
                    {c.name}
                  </span>
                  <span className="block text-xs text-muted leading-snug">
                    {c.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. Details ────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="tnt-panel p-6 space-y-4">
          <Field label="Title">
            <input
              className="tnt-input"
              value={f.title}
              maxLength={160}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Levi's Type III trucker jacket, medium"
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Brand (optional)">
              <input
                className="tnt-input"
                value={f.brand}
                maxLength={80}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="Levi's, Nintendo, handmade…"
              />
            </Field>
            <Field label="Item name (optional)">
              <input
                className="tnt-input"
                value={f.itemName}
                maxLength={160}
                onChange={(e) => set("itemName", e.target.value)}
                placeholder="What is it, in a few words"
              />
            </Field>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-semibold">Condition</legend>
            <div className="grid sm:grid-cols-2 gap-2">
              {CONDITIONS.map((c) => {
                const selected = f.condition === c.value;
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
                      name="condition"
                      className="mt-1"
                      value={c.value}
                      checked={selected}
                      onChange={() => set("condition", c.value)}
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
          </fieldset>

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
              maxLength={4000}
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Flaws, measurements, what's included, why you're selling — anything a buyer would want to know."
            />
            {aiDescNote && (
              <p className="text-xs font-medium text-[var(--tnt-ink-soft)]">
                {aiDescNote}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── 4. Attributes ─────────────────────────────────────────── */}
      {step === 3 && (
        <div className="tnt-panel p-6 space-y-4">
          <div>
            <p className="text-sm font-semibold">
              {category ? `${category.emoji} ${category.name} details` : "Details"}
            </p>
            <p className="text-xs text-muted">
              All optional. They show as a spec table on your listing and power
              the filters buyers browse with.
            </p>
          </div>
          {category && category.attributes.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {category.attributes.map((field) => (
                <Field key={field.key} label={field.label}>
                  <AttributeInput
                    field={field}
                    value={f.attributes[field.key] ?? ""}
                    onChange={(v) => setAttribute(field.key, v)}
                  />
                  {field.hint && (
                    <p className="text-xs text-muted mt-1">{field.hint}</p>
                  )}
                </Field>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Nothing extra needed for this category.
            </p>
          )}
        </div>
      )}

      {/* ── 5. Price & quantity ───────────────────────────────────── */}
      {step === 4 && (
        <div className="tnt-panel p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Price (USD)">
              <input
                className="tnt-input"
                type="number"
                step="0.01"
                min="1"
                value={f.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Quantity">
              <input
                className="tnt-input"
                type="number"
                step="1"
                min="1"
                max="999"
                value={f.quantity}
                onChange={(e) => set("quantity", e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-muted -mt-2">
            Have more than one of the exact same item? List them all at once —
            the listing shows as sold out when the last one sells.
          </p>

          {/* Fee disclosure — computed from the same helper checkout uses. */}
          <div
            className="tnt-panel p-4 space-y-1 text-sm"
            style={{
              background: "var(--tnt-green-soft)",
              borderColor: "var(--tnt-green)",
            }}
          >
            <div className="flex justify-between gap-3">
              <span className="text-muted">You list at</span>
              <span className="font-semibold text-ink">
                {priceCents > 0 ? formatCents(priceCents) : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted">
                This&apos;n&apos;that fee ({PLATFORM_FEE_LABEL})
              </span>
              <span className="text-ink">
                {priceCents > 0 ? `− ${formatCents(fees.platformFeeCents)}` : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3 border-t border-[var(--tnt-green)] pt-1 mt-1">
              <span className="font-semibold text-ink">You receive</span>
              <span className="font-display text-lg font-semibold text-[var(--tnt-green)]">
                {priceCents > 0 ? formatCents(fees.sellerProceedsCents) : "—"}
              </span>
            </div>
            <p className="text-xs text-muted pt-1">
              The fee comes out of the item price only, when the sale completes.
              Buyers pay shipping on top of your price.
            </p>
          </div>

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
                  Any offer at or above your floor turns into an order
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
        </div>
      )}

      {/* ── 6. Shipping ───────────────────────────────────────────── */}
      {step === 5 && (
        <div className="tnt-panel p-6 space-y-4">
          <div>
            <p className="text-sm font-semibold">Shipping</p>
            <p className="text-xs text-muted">
              Every order ships direct from you to the buyer. You&apos;re paid
              out through Stripe once the buyer confirms delivery.
            </p>
          </div>
          {shipFromPostalCode ? (
            <div
              className="tnt-panel p-4 space-y-1"
              style={{
                background: "var(--tnt-green-soft)",
                borderColor: "var(--tnt-green)",
              }}
            >
              <p className="text-sm font-semibold text-[var(--tnt-green)]">
                📦 Ships from ZIP {shipFromPostalCode}
              </p>
              <p className="text-xs text-muted">
                Buyers are charged live-rated shipping from this ZIP at
                checkout. Change it any time in{" "}
                <Link
                  href="/dashboard/profile"
                  target="_blank"
                  rel="noopener"
                  className="font-semibold !text-[var(--tnt-green)]"
                >
                  your profile
                </Link>
                .
              </p>
            </div>
          ) : (
            <div
              className="tnt-panel p-4 space-y-1"
              style={{
                background: "var(--tnt-red-soft)",
                borderColor: "var(--tnt-red)",
              }}
            >
              <p className="text-sm font-semibold text-ink">
                ⚠️ No ship-from ZIP on your profile yet
              </p>
              <p className="text-xs text-ink">
                Add one in{" "}
                <Link
                  href="/dashboard/profile"
                  target="_blank"
                  rel="noopener"
                  className="font-semibold !text-[var(--tnt-red)]"
                >
                  your profile
                </Link>{" "}
                (opens in a new tab) so buyers are charged live-rated shipping
                from your location. Until then a flat shipping rate applies.
                You can still post this listing now.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── 7. Preview ────────────────────────────────────────────── */}
      {step === LAST_STEP && (
        <>
          <p className="text-muted text-sm text-center">
            Here&apos;s how your listing will look. Edit if anything&apos;s off,
            save as a draft for later, or post it now.
          </p>

          <article className="tnt-panel p-5 space-y-5">
            {finalPhotos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {finalPhotos.map((p, i) => (
                  <div
                    key={p + i}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-[var(--tnt-line-strong)] bg-[var(--tnt-surface)]"
                  >
                    <Image
                      src={p}
                      alt={`${f.title || "Listing photo"} ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, 320px"
                      className="object-cover"
                      unoptimized={!canOptimizeImage(p)}
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
              {f.condition && <ConditionBadge condition={f.condition} size="lg" />}
              <h2 className="text-2xl">{f.title.trim() || "(Untitled listing)"}</h2>
              <p className="text-muted text-sm">
                {[f.brand.trim(), f.itemName.trim(), category?.name]
                  .filter(Boolean)
                  .join(" · ")}
                {quantityNum > 1 ? ` · ${quantityNum} available` : ""}
              </p>
              {previewAttributes.length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  {previewAttributes.map((a) => (
                    <div key={a.key} className="contents">
                      <dt className="text-muted">{a.label}</dt>
                      <dd className="text-ink">{a.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {f.description && (
                <p className="whitespace-pre-wrap text-sm">{f.description}</p>
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
              onClick={() => goTo(2)}
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
              {busy ? "Saving…" : "Save as draft"}
            </button>
            <button
              type="button"
              onClick={() => submit("post")}
              className="tnt-btn flex-1"
              disabled={busy}
            >
              {busy
                ? "Saving…"
                : canPublish
                  ? "Post listing"
                  : "Save draft — payouts needed to publish"}
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

      {/* Step navigation (every step but the preview, which has its own) */}
      {step < LAST_STEP && (
        <div className="space-y-2">
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <div className="flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                disabled={photoBusy || aiBusy}
                className="tnt-btn tnt-btn--ghost disabled:opacity-60"
              >
                ← Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={photoBusy || aiBusy}
              className="tnt-btn flex-1 disabled:opacity-60"
            >
              {photoBusy
                ? studio
                  ? "Uploading & optimizing photos…"
                  : "Uploading photos…"
                : step === LAST_STEP - 1
                  ? "Preview →"
                  : `Next: ${STEPS[step + 1]} →`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One attribute field from a category schema — never branches on a slug. */
function AttributeInput({
  field,
  value,
  onChange,
}: {
  field: AttributeField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "select") {
    return (
      <select
        className="tnt-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "number") {
    return (
      <input
        className="tnt-input"
        type="number"
        min={field.min}
        max={field.max}
        step={1}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className="tnt-input"
      value={value}
      maxLength={120}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
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

/** Step indicator. Completed steps are clickable so the seller can hop back. */
function Stepper({
  step,
  onJump,
}: {
  step: StepIndex;
  onJump: (step: StepIndex) => void;
}) {
  return (
    <ol
      className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold text-muted overflow-x-auto tnt-noscrollbar"
      aria-label="Listing steps"
    >
      {STEPS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <li key={label} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {i > 0 && <span className="w-3 sm:w-5 h-px bg-[var(--tnt-line-strong)]" />}
            <button
              type="button"
              onClick={() => done && onJump(i as StepIndex)}
              disabled={!done}
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-1.5 ${done ? "cursor-pointer" : "cursor-default"}`}
            >
              <span
                className={`tnt-step !w-7 !h-7 !text-xs ${
                  active ? "tnt-step--active" : done ? "tnt-step--done" : ""
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`hidden md:inline ${active ? "text-ink" : ""}`}>
                {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
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
