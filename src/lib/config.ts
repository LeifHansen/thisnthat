// Runtime inspection of the payment + shipping + email configuration. The app
// is designed to boot without keys (build, non-payment pages) and to fall back
// to flat-rate shipping when EasyPost is absent — convenient in development,
// and the Stripe/SendGrid gaps are dangerous if they slip into production
// unnoticed. This module turns that silent state into something the
// /api/health endpoint can fail loudly on.
//
// Secrets are NEVER returned — only their *mode* (live / test / unset).

import { stripePublishableKey } from "@/lib/stripePublic";

type KeyMode = "live" | "test" | "unset" | "unknown";

function stripeMode(key: string | undefined): KeyMode {
  if (!key) return "unset";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  if (key.startsWith("pk_live_")) return "live";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if (key.startsWith("pk_test_")) return "test";
  return "unknown";
}

function easypostMode(key: string | undefined): KeyMode {
  if (!key) return "unset";
  if (/^EZAK/i.test(key)) return "live";
  if (/^EZTK/i.test(key)) return "test";
  return "unknown";
}

export type ConfigReport = {
  env: string;
  isProd: boolean;
  stripe: KeyMode;
  stripePublishable: KeyMode;
  stripeWebhook: boolean;
  easypost: KeyMode;
  easypostWebhook: boolean;
  sendgrid: boolean;
  authSecret: boolean;
  database: boolean;
  warnings: string[];
  errors: string[];
  /** true when nothing blocking is wrong for the current environment. */
  ready: boolean;
};

export function inspectConfig(): ConfigReport {
  const env = process.env.NODE_ENV ?? "development";
  const isProd = env === "production";

  const stripe = stripeMode(process.env.STRIPE_SECRET_KEY);
  // Resolved exactly the way checkout resolves it, so this report describes the
  // key customers actually get rather than a different one.
  const stripePublishable = stripeMode(stripePublishableKey() || undefined);
  const stripeWebhook = !!process.env.STRIPE_WEBHOOK_SECRET;
  const easypost = easypostMode(process.env.EASYPOST_API_KEY);
  const easypostWebhook = !!process.env.EASYPOST_WEBHOOK_SECRET;
  const sendgrid = !!process.env.SENDGRID_API_KEY;
  const authSecretVal = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const authSecret = !!authSecretVal;
  const database = !!process.env.DATABASE_URL;

  const warnings: string[] = [];
  const errors: string[] = [];
  // In production a misconfiguration is blocking; in dev it's just a warning.
  const blocking = (msg: string) => (isProd ? errors : warnings).push(msg);

  // --- Core infra: without these the app can't authenticate or read data ---
  if (!database) {
    errors.push(
      "DATABASE_URL is not set — the database is unreachable and every page will fail.",
    );
  }
  if (!authSecret) {
    errors.push(
      "AUTH_SECRET is not set — sign-in and session verification will fail.",
    );
  } else if (isProd && authSecretVal && authSecretVal.length < 32) {
    warnings.push(
      "AUTH_SECRET is short (<32 chars) — use a longer random secret.",
    );
  }

  // --- Stripe secret key ---
  if (stripe === "unset") {
    errors.push("STRIPE_SECRET_KEY is not set — payments will fail.");
  } else if (stripe === "test" && isProd) {
    errors.push(
      "STRIPE_SECRET_KEY is a TEST key in production — real customers cannot pay.",
    );
  } else if (stripe === "test") {
    warnings.push("Stripe is in TEST mode (test card 4242 only).");
  } else if (stripe === "unknown") {
    warnings.push("STRIPE_SECRET_KEY has an unrecognised prefix.");
  }

  // --- Publishable key must be present, or Stripe.js can't init client-side ---
  if (stripePublishable === "unset") {
    errors.push(
      "STRIPE_PUBLISHABLE_KEY is not set — checkout cannot load client-side and no customer can pay.",
    );
  }

  // --- Secret / publishable mode must match ---
  const knownStripe = stripe === "live" || stripe === "test";
  const knownPub =
    stripePublishable === "live" || stripePublishable === "test";
  if (knownStripe && knownPub && stripe !== stripePublishable) {
    errors.push(
      `Stripe key mismatch: secret is ${stripe}, publishable is ${stripePublishable}.`,
    );
  }

  // --- Webhook secret: without it, paid orders never advance ---
  if (!stripeWebhook) {
    blocking(
      "STRIPE_WEBHOOK_SECRET is not set — paid orders will never advance past the initial state.",
    );
  }

  // --- EasyPost ---
  // Optional in every environment: without a key, checkout quotes the flat
  // shipping rate and sellers enter tracking by hand (rateSaleShipping /
  // buySaleLabel fall back cleanly). Worth knowing, never blocking.
  if (easypost === "unset") {
    warnings.push(
      "EASYPOST_API_KEY is not set — shipping uses flat estimates instead of live rates, and labels can't be bought through the platform.",
    );
  } else if (easypost === "test" && isProd) {
    errors.push(
      "EASYPOST_API_KEY is a TEST key in production — labels won't be real postage.",
    );
  } else if (easypost === "test") {
    warnings.push("EasyPost is in TEST mode (rates/labels are not real).");
  } else if (easypost === "unknown") {
    warnings.push("EASYPOST_API_KEY has an unrecognised prefix.");
  }
  if (easypost !== "unset" && !easypostWebhook) {
    warnings.push(
      "EASYPOST_WEBHOOK_SECRET is not set — EasyPost tracking webhooks will be rejected and shipment statuses won't auto-update.",
    );
  }

  // --- Transactional email ---
  // sendEmail() treats a missing key as a successful no-op so local dev works
  // without SendGrid. That is exactly the silent state this module exists to
  // surface: in production it means no receipts, no "you sold an item", no
  // offer or refund notices — with nothing failing anywhere to reveal it.
  if (!sendgrid) {
    blocking(
      "SENDGRID_API_KEY is not set — every transactional email (receipts, sale and offer notices, refunds) is silently skipped.",
    );
  } else if (process.env.SENDGRID_SANDBOX === "1" && isProd) {
    errors.push(
      "SENDGRID_SANDBOX=1 in production — emails are accepted by SendGrid but never delivered.",
    );
  }

  return {
    env,
    isProd,
    stripe,
    stripePublishable,
    stripeWebhook,
    easypost,
    easypostWebhook,
    sendgrid,
    authSecret,
    database,
    warnings,
    errors,
    ready: errors.length === 0,
  };
}
