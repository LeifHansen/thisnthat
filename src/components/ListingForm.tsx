"use client";

import { useActionState, useState } from "react";
import { createListing, type ActionState } from "@/lib/actions";
import type { Category } from "@/lib/types";

const initial: ActionState = { ok: false };

export function ListingForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState(createListing, initial);
  const [previews, setPreviews] = useState<string[]>([]);
  const [allowOffers, setAllowOffers] = useState(true);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPreviews(files.map((f) => URL.createObjectURL(f)));
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Photos */}
      <Field label="Photos" hint="The first photo is your cover.">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-8 text-center text-sm text-zinc-500 transition-colors hover:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900">
          <span className="font-medium text-indigo-600 dark:text-indigo-400">Click to upload</span>
          <span>or drag photos here</span>
          <input
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
              <img
                key={i}
                src={src}
                alt=""
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        )}
      </Field>

      <Field label="Title">
        <input name="title" required placeholder="e.g. 1980s Levi's Trucker Jacket" className={input} />
      </Field>

      <Field label="Description">
        <textarea
          name="description"
          rows={4}
          placeholder="Condition details, measurements, story…"
          className={input}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Price (USD)">
          <input name="price" type="number" min="0" step="1" required placeholder="85" className={input} />
        </Field>
        <Field label="Category">
          <select name="category" defaultValue="clothing" className={input}>
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
          <select name="condition" defaultValue="Good" className={input}>
            {["New", "Like New", "Good", "Worn"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Brand">
          <input name="brand" placeholder="Optional" className={input} />
        </Field>
        <Field label="Size">
          <input name="size" placeholder="Optional" className={input} />
        </Field>
      </div>

      {/* Offers */}
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

      {state.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Publishing…" : "Publish listing"}
      </button>
    </form>
  );
}

const input =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {hint && <span className="mb-1 block text-xs text-zinc-500">{hint}</span>}
      {children}
    </label>
  );
}
