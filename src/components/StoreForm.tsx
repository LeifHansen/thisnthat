"use client";

import { useActionState } from "react";
import { saveStore, type ActionState } from "@/lib/actions";
import type { Store } from "@/lib/types";

const initial: ActionState = { ok: false };

export function StoreForm({ store }: { store: Store }) {
  const [state, formAction, pending] = useActionState(saveStore, initial);

  return (
    <form action={formAction} className="space-y-6">
      <Field label="Store name">
        <input name="name" required defaultValue={store.name} className={input} />
      </Field>

      <Field label="Tagline">
        <input name="tagline" defaultValue={store.tagline ?? ""} placeholder="A short hook for your shop" className={input} />
      </Field>

      <Field label="About">
        <textarea name="description" rows={3} defaultValue={store.description ?? ""} className={input} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Primary color">
          <ColorInput name="primary" defaultValue={store.theme.primary} />
        </Field>
        <Field label="Accent color">
          <ColorInput name="accent" defaultValue={store.theme.accent} />
        </Field>
      </div>

      {/* Live preview of the store banner */}
      <div>
        <span className="mb-1 block text-sm font-medium">Banner preview</span>
        <div
          className="flex h-28 items-center gap-3 rounded-xl px-5 text-white"
          style={{
            backgroundImage: `linear-gradient(135deg, ${store.theme.primary}, ${store.theme.accent})`,
          }}
        >
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/20 text-xl font-bold backdrop-blur">
            {store.name.charAt(0)}
          </div>
          <div>
            <div className="text-lg font-bold">{store.name}</div>
            {store.tagline && <div className="text-sm text-white/80">{store.tagline}</div>}
          </div>
        </div>
      </div>

      {state.ok && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          Saved! View your{" "}
          <a href={`/store/${store.slug}`} className="font-medium underline">
            storefront
          </a>
          .
        </p>
      )}
      {state.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save store"}
      </button>
    </form>
  );
}

const input =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700";

function ColorInput({ name, defaultValue }: { name: string; defaultValue: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" name={name} defaultValue={defaultValue} className="h-9 w-12 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700" />
      <span className="text-sm text-zinc-500">{defaultValue}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
