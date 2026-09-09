#!/usr/bin/env node
// Deploy-time answer to "can anyone actually check out?".
//
// A missing Stripe publishable key is the one misconfiguration that breaks every
// payment on the site while failing nowhere: the deploy is green, the build is
// green, the site is up, and the checkout panel just tells buyers payments are
// unavailable. Nothing in the pipeline notices, because the key is only ever
// used in the browser. So we look, on every release, from the machine that will
// serve traffic — and print the verdict into the deploy log.
//
// Never prints a key. Only whether one is set, and whether it is live or test —
// both public facts about the site. Exits 0 no matter what: like the rest of the
// release command, it reports rather than wedging a deploy.

function mode(key) {
  if (/^(?:sk|rk|pk)_live_/.test(key)) return "live";
  if (/^(?:sk|rk|pk)_test_/.test(key)) return "test";
  return "unknown";
}

const key = (process.env.STRIPE_PUBLISHABLE_KEY ?? "").trim();
const secretMode = mode((process.env.STRIPE_SECRET_KEY ?? "").trim());

if (!key) {
  console.error(
    "[stripe-check] FAIL: STRIPE_PUBLISHABLE_KEY is not set — checkout will show 'Card payments are temporarily unavailable' to every buyer.",
  );
  console.error(
    "[stripe-check] Fix without a rebuild: fly secrets set STRIPE_PUBLISHABLE_KEY=pk_live_…",
  );
} else if (!key.startsWith("pk_")) {
  console.error(
    "[stripe-check] FAIL: STRIPE_PUBLISHABLE_KEY is set but is not a pk_… key, so it will be refused (a secret key must never reach the browser). Checkout will show 'Card payments are temporarily unavailable'.",
  );
} else {
  console.log(`[stripe-check] OK: STRIPE_PUBLISHABLE_KEY is set (${mode(key)}).`);
  if (secretMode !== "unknown" && mode(key) !== secretMode) {
    console.error(
      `[stripe-check] WARNING: STRIPE_SECRET_KEY is ${secretMode} but STRIPE_PUBLISHABLE_KEY is ${mode(key)} — Stripe will reject payments until the pair matches.`,
    );
  }
}

process.exit(0);
