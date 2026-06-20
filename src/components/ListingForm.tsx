"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { createListing, analyzePhotos, type ActionState } from "@/lib/actions";
import type { ListingSuggestion } from "@/lib/ai";
import { formatPrice, type Category } from "@/lib/types";

const initial: ActionState = { ok: false };

export function ListingForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState(createListing, initial);
  const [previews, setPreviews] = useState<string[]>([]);
  const [scanning, startScan] = useTransition();
  const [suggestion, setSuggestion] = useState<ListingSuggestion | null>(null);
  const [revealed, setRevealed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Editable fields (pre-filled by the AI scan, fully overridable).
  const [fields, setFields] = useState({
    title: "",
    description: "",
    price: "",
    category: "clothing",
    condition: "Good",
    brand: "",
    size: "",
  });
  const [allowOffers, setAllowOffers] = useState(true);

  function set<K extends keyof typeof fields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPreviews(files.map((f) => URL.createObjectURL(f)));
    setRevealed(true);

    // Photo-first: immediately scan with AI and pre-fill the form.
    const fd = new FormData();
    files.forEach((f) => fd.append("images", f));
    startScan(async () => {
      const res = await analyzePhotos({ ok: false }, fd);
      if (res.ok && res.suggestion) {
        const s = res.suggestion;
        setSuggestion(s);
        setFields({
          title: s.title,
          description: s.description,
          price: String(Math.round(s.suggested_price_cents / 100)),
          category: s.category_slug,
          condition: s.condition,
          brand: s.brand ?? "",
          size: s.size ?? "",
        });
      }
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Step 1 — Photos */}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Step n={1} />
          <span className="text-sm font-semibold">Add photos</span>
        </div>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-500 transition-colors hover:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900">
          <span className="text-base font-semibold text-indigo-600 dark:text-indigo-400">
            Upload photos to start
          </span>
          <span className="mt-1">We&apos;ll scan them and fill in the details for you ✨</span>
          <input
            ref={fileRef}
            type="file"
            name="images"
            accept="image/*"
            multiple
            onChange={onPick}
            className="hidden"
          />
        </label>
        {previews.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {previews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" className="aspect-square w-full rounded-lg object-cover" />
            ))}
          </div>
        )}
      </div>

      {/* AI status */}
      {scanning && (
        <div className="flex items-center gap-3 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          <Spinner />
          Scanning your photos with AI…
        </div>
      )}
      {suggestion && !scanning && (
        <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          {suggestion.source === "ai" ? (
            <>✨ AI filled this in from your photos — review and tweak anything.</>
          ) : (
            <>✨ Sample auto-fill shown. Add a <code>GEMINI_API_KEY</code> to scan real photos.</>
          )}
          {suggestion.suggested_price_cents > 0 && (
            <> Suggested price: <strong>{formatPrice(suggestion.suggested_price_cents)}</strong>.</>
          )}
        </div>
      )}

      {/* Step 2 — Details (revealed after photos) */}
      <div className={revealed ? "space-y-6" : "pointer-events-none space-y-6 opacity-40"}>
        <div className="flex items-center gap-2">
          <Step n={2} />
          <span className="text-sm font-semibold">Review details</span>
        </div>

        <Field label="Title">
          <input
            name="title"
            required
            value={fields.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. 1980s Levi's Trucker Jacket"
            className={input}
          />
        </Field>

        <Field label="Description">
          <textarea
            name="description"
            rows={4}
            value={fields.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Condition details, measurements, story…"
            className={input}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Price (USD)">
            <input
              name="price"
              type="number"
              min="0"
              step="1"
              required
              value={fields.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="85"
              className={input}
            />
          </Field>
          <Field label="Category">
            <select
              name="category"
              value={fields.category}
              onChange={(e) => set("category", e.target.value)}
              className={input}
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Condition">
            <select
              name="condition"
              value={fields.condition}
              onChange={(e) => set("condition", e.target.value)}
              className={input}
            >
              {["New", "Like New", "Good", "Worn"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Brand">
            <input name="brand" value={fields.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Optional" className={input} />
          </Field>
          <Field label="Size">
            <input name="size" value={fields.size} onChange={(e) => set("size", e.target.value)} placeholder="Optional" className={input} />
          </Field>
        </div>

        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="allow_offers"
              checked={allowOffers}
              onChange={(e) => setAllowOffers(e.target.checked)}
              className="h-4 w-4 accent-indigo-600"
            />
            <span className="text-sm font-medium">Accept offers on this item</span>
          </label>
          {allowOffers && (
            <div className="mt-3 max-w-xs">
              <Field label="Minimum offer (optional)">
                <input name="min_offer" type="number" min="0" step="1" placeholder="No minimum" className={input} />
              </Field>
            </div>
          )}
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !revealed}
        className="w-full rounded-lg bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "Publishing…" : "Publish listing"}
      </button>
    </form>
  );
}

const input =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">
      {n}
    </span>
  );
}

function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
  );
}
