"use client";

import Link from "next/link";
import { useActionState } from "react";
import { placeOrder, type CheckoutState } from "@/lib/actions";
import { formatPrice, type Listing } from "@/lib/types";

const initial: CheckoutState = { ok: false };

export function CheckoutForm({ listing }: { listing: Listing }) {
  const [state, formAction, pending] = useActionState(placeOrder, initial);

  if (state.ok) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950">
        <h2 className="text-xl font-bold text-emerald-800 dark:text-emerald-200">
          Order confirmed 🎉
        </h2>
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
          Order <span className="font-mono">{state.orderId}</span> — a receipt is on its way.
        </p>

        {/* Always push account creation, even post-purchase */}
        <div className="mt-5 rounded-lg bg-white p-4 dark:bg-zinc-900">
          {state.createdAccount ? (
            <>
              <p className="text-sm font-medium">Finish setting up your account</p>
              <p className="mt-1 text-sm text-zinc-500">
                Add a password to track this order, reorder in one tap, and save your details.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Create an account for faster checkout</p>
              <p className="mt-1 text-sm text-zinc-500">
                Track your order, save shipping info, and get first dibs on new drops.
              </p>
            </>
          )}
          <Link
            href="/login"
            className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Create account →
          </Link>
        </div>

        <Link href="/" className="mt-4 inline-block text-sm text-emerald-700 underline dark:text-emerald-300">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="listing_id" value={listing.id} />

      {/* Account-creation nudge up top */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">
              Checking out as a guest
            </p>
            <p className="mt-0.5 text-sm text-indigo-700 dark:text-indigo-300">
              Already have an account?{" "}
              <Link href="/login" className="font-medium underline">
                Sign in
              </Link>{" "}
              for one-tap checkout.
            </p>
          </div>
        </div>
      </div>

      <Field label="Email">
        <input name="email" type="email" required placeholder="you@email.com" className={input} />
      </Field>
      <Field label="Full name">
        <input name="name" required placeholder="Jordan Doe" className={input} />
      </Field>
      <Field label="Shipping address">
        <textarea name="address" rows={3} required placeholder="Street, city, state, ZIP" className={input} />
      </Field>

      {/* Info gathering / account creation push */}
      <label className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <input type="checkbox" name="create_account" defaultChecked className="mt-0.5 h-4 w-4 accent-indigo-600" />
        <span className="text-sm">
          <span className="font-medium">Create an account with this email</span>
          <span className="block text-zinc-500">Track orders, save info, and check out faster next time.</span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="marketing_opt_in" defaultChecked className="mt-0.5 h-4 w-4 accent-indigo-600" />
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Email me new drops, price drops on items I love, and seller restocks.
        </span>
      </label>

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
        {pending ? "Placing order…" : `Pay ${formatPrice(listing.price_cents, listing.currency)} (demo)`}
      </button>
      <p className="text-center text-xs text-zinc-400">
        Demo checkout — Stripe Connect payments wire in here next.
      </p>
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
