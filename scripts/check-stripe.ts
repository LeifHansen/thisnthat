/**
 * Standalone Stripe check. Confirms the secret key works and the two
 * PaymentIntent flows the app relies on both succeed:
 *   1. Manual-capture (marketplace escrow): confirm -> requires_capture -> capture -> succeeded
 *   2. Immediate-capture (authentication):  confirm -> succeeded
 *
 * Run with your TEST secret key (it refuses a live key):
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/check-stripe.ts
 *
 * "✓ both payment flows work" means Stripe is reachable, the key is valid, and
 * authorize/capture behave as the checkout and authentication routes expect.
 * This talks to Stripe directly (no app imports) so it runs anywhere.
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY (use your TEST key: sk_test_…).");
  process.exit(1);
}
if (!key.startsWith("sk_test_")) {
  console.error(
    "Refusing to run with a non-test key — this confirms real charges in live mode.\n" +
      "Use your test secret key (sk_test_…).",
  );
  process.exit(1);
}
const stripe = new Stripe(key);

// A card-only PI we can confirm server-side without a redirect/return_url.
function intentBase(amount: number, kind: string) {
  return {
    amount,
    currency: "usd",
    automatic_payment_methods: { enabled: true, allow_redirects: "never" as const },
    metadata: { kind, check: "true" },
  };
}

async function main() {
  console.log(`Key: ${key!.slice(0, 11)}…  (TEST mode)\n`);

  // 1. Manual-capture escrow flow (marketplace sales): authorize, then capture.
  const escrow = await stripe.paymentIntents.create({
    ...intentBase(2599, "sale"),
    capture_method: "manual",
  });
  const escrowAuth = await stripe.paymentIntents.confirm(escrow.id, {
    payment_method: "pm_card_visa",
  });
  console.log(`escrow PI  authorize -> ${escrowAuth.status}   (expect requires_capture)`);
  const escrowCap = await stripe.paymentIntents.capture(escrow.id);
  console.log(`escrow PI  capture   -> ${escrowCap.status}   (expect succeeded)`);
  const escrowOk =
    escrowAuth.status === "requires_capture" && escrowCap.status === "succeeded";

  // 2. Immediate-capture flow (authentication service): paid up front.
  const auth = await stripe.paymentIntents.create(intentBase(2000, "auth"));
  const authConf = await stripe.paymentIntents.confirm(auth.id, {
    payment_method: "pm_card_visa",
  });
  console.log(`auth PI    pay       -> ${authConf.status}   (expect succeeded)`);
  const authOk = authConf.status === "succeeded";

  // 3. Redirect exposure. Every intent the app creates sets
  //    `allow_redirects: "never"`, because all three checkout surfaces confirm
  //    with `redirect: "if_required"` and pass no `return_url` — a redirect
  //    method reaching the Payment Element is a dead payment button, and which
  //    methods are live is a Dashboard setting nobody changes in this repo. So
  //    ask Stripe what THIS account would have offered without the guard.
  const guarded = await stripe.paymentIntents.create(intentBase(2599, "probe"));
  const unguarded = await stripe.paymentIntents.create({
    amount: 2599,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: { kind: "probe", check: "true" },
  });
  const guardedMethods = guarded.payment_method_types ?? [];
  const redirectOnly = (unguarded.payment_method_types ?? []).filter(
    (m) => !guardedMethods.includes(m),
  );
  console.log(`\nmethods offered with the guard: ${guardedMethods.join(", ")}`);
  if (redirectOnly.length > 0) {
    console.log(
      `redirect-based methods the guard is suppressing: ${redirectOnly.join(", ")}`,
    );
    console.log(
      "  ^ these are enabled on the account. They are correctly hidden today,\n" +
        "    but offering them means adding a return_url + redirect_status\n" +
        "    handling to the checkout surfaces first.",
    );
  } else {
    console.log("no redirect-based methods are enabled on this account.");
  }
  // Housekeeping: these two were never confirmed, so cancel rather than leaving
  // them open in the Dashboard.
  await Promise.allSettled([
    stripe.paymentIntents.cancel(guarded.id),
    stripe.paymentIntents.cancel(unguarded.id),
  ]);

  console.log();
  if (escrowOk && authOk) {
    console.log("✓ Stripe is reachable and both payment flows work.");
  } else {
    console.log("✗ Stripe responded but a flow didn't reach the expected state (see above).");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("\n✗ Stripe check FAILED:");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
