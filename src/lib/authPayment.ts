import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { requireStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { ensureInboundLabel } from "@/lib/authLabels";

/**
 * The Stripe webhook is the primary path that moves a paid authentication
 * submission forward (REQUESTED -> AWAITING_INBOUND). If a delivery is missed
 * (endpoint misconfigured, outage, retries exhausted) the submission stays at
 * REQUESTED: the admin queue never shows it and the submitter is told their
 * payment didn't complete — even though the charge succeeded in Stripe. These
 * helpers let read paths reconcile that state directly against Stripe.
 */

/**
 * What to do about the prepaid inbound label once a batch advances.
 *
 *   background — buy it without holding the caller (dashboards, sweeps).
 *   await      — buy it before returning: the submission page the submitter
 *                lands on right after paying, where "print your label" has to
 *                be there on first render rather than a "ship it yourself"
 *                fallback that would have them pay postage twice.
 *   skip       — the caller buys it itself (the webhook, which awaits its own
 *                call so a replay can retry a failed purchase).
 */
export type LabelMode = "background" | "await" | "skip";

/**
 * Advance every request in the batch behind a succeeded auth PaymentIntent to
 * AWAITING_INBOUND — the same matching rules and transition as the webhook, so
 * the two paths stay mutually idempotent. Returns how many rows advanced.
 */
export async function advancePaidAuthBatch(
  pi: Stripe.PaymentIntent,
  opts: { label?: LabelMode } = {},
): Promise<number> {
  if (pi.status !== "succeeded") return 0;
  const batchId = pi.metadata?.batchId;
  const { count } = await prisma.authenticationRequest.updateMany({
    where: {
      ...(batchId ? { batchId } : { stripePaymentIntentId: pi.id }),
      status: { in: ["REQUESTED", "PAID"] },
    },
    data: { status: "AWAITING_INBOUND" },
  });

  // Advancing the batch is only half of what payment bought. The submitter was
  // also billed for inbound postage, and until this runs they have paid us for
  // a label that does not exist — so the reconciliation paths must buy it too,
  // not just the webhook. Claimed batch-wide inside ensureInboundLabel, so no
  // two callers can buy postage twice.
  const label = opts.label ?? "background";
  if (count > 0 && batchId && label !== "skip") {
    const purchase = ensureInboundLabel(batchId).catch((e) =>
      console.error(
        `[authPayment] inbound label step failed for batch ${batchId}`,
        e,
      ),
    );
    if (label === "await") await purchase;
    else void purchase;
  }

  return count;
}

/**
 * Find requests still in a pre-payment status that already have a
 * PaymentIntent, ask Stripe what actually happened to each, and advance any
 * whose payment succeeded. Best-effort: returns the number of rows advanced,
 * and 0 (rather than throwing) when Stripe is unconfigured or unreachable, so
 * the dashboards that call this never break on a reconciliation attempt.
 */
export async function reconcileStuckAuthRequests(
  where: Prisma.AuthenticationRequestWhereInput = {},
): Promise<number> {
  let stripe: Stripe;
  try {
    stripe = requireStripe();
  } catch {
    return 0;
  }

  const stuck = await prisma.authenticationRequest.findMany({
    where: {
      ...where,
      status: { in: ["REQUESTED", "PAID"] },
      stripePaymentIntentId: { not: null },
      // Abandoned (never-paid) submissions sit at REQUESTED forever; without a
      // window every sweep would re-check the same dead intents. A missed
      // webhook surfaces within days, so 90 days is a wide margin. (The
      // submission detail page still reconciles any age on view.)
      createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
    select: { stripePaymentIntentId: true },
    orderBy: { createdAt: "desc" },
    // Bound the Stripe round-trips; older stragglers get picked up on
    // subsequent loads once these resolve.
    take: 25,
  });

  // A batch shares one PaymentIntent — dedupe so it's checked once.
  const intentIds = new Set(
    stuck.flatMap((s) =>
      s.stripePaymentIntentId ? [s.stripePaymentIntentId] : [],
    ),
  );

  const advanced = await Promise.all(
    [...intentIds].map(async (intentId) => {
      try {
        const pi = await stripe.paymentIntents.retrieve(intentId);
        return await advancePaidAuthBatch(pi);
      } catch {
        // Unreadable intent (network, deleted in Stripe) — leave the request
        // as-is; the webhook or a later pass can still advance it.
        return 0;
      }
    }),
  );
  return advanced.reduce((sum, n) => sum + n, 0);
}
