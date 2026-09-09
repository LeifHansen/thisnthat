"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Shared Stripe.js loader for the checkout surfaces.
//
// The key arrives as a prop resolved on the server at request time (see
// lib/stripePublic.ts). It is deliberately never read from `process.env` here:
// only `NEXT_PUBLIC_*` names are available to browser code, and those are frozen
// into the bundle at build time — the very thing that made checkout unfixable
// without a rebuild. Each component used to call `loadStripe()` once at module
// scope, which a prop can't do — hence the cache: `loadStripe` must be called
// once per key, not once per render, or every render swaps the <Elements> stripe
// instance and remounts the card fields.

const loaders = new Map<string, Promise<Stripe | null>>();

/**
 * Returns the Stripe.js promise for `publishableKey`, or null when no key is
 * configured — callers render their "payments unavailable" state on null.
 */
export function stripeFor(
  publishableKey?: string | null,
): Promise<Stripe | null> | null {
  const key = (publishableKey ?? "").trim();
  if (!key) return null;

  let loader = loaders.get(key);
  if (!loader) {
    loader = loadStripe(key);
    loaders.set(key, loader);
  }
  return loader;
}
