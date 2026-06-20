// Stripe Connect client (marketplace model).
//
// Lazily constructed and gated on STRIPE_SECRET_KEY so the app runs without
// Stripe configured (checkout falls back to the local demo flow). With a key
// set, payments use destination charges: the buyer pays, the platform takes an
// application fee, and the remainder is transferred to the seller's connected
// account.

import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (stripe) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripe = new Stripe(key);
  return stripe;
}

export const isStripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

// Platform fee in basis points (800 = 8%).
export const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? "800");

export function platformFeeCents(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_BPS) / 10000);
}

// Public base URL used for Stripe redirect (success/return) URLs.
export function appUrl(): string {
  return (
    process.env.AUTH_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
