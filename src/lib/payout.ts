import type Stripe from "stripe";
import { requireStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import * as notify from "@/lib/notify";

/**
 * Where a seller stands in payout onboarding.
 *
 *   none        no Express account exists yet
 *   incomplete  Stripe is still waiting on the seller for something
 *   pending     the seller finished the form; Stripe is verifying
 *   enabled     payouts are live
 *
 * "pending" exists because it used to be reported as "incomplete": a seller who
 * had just completed onboarding was told they "need a few more details" over a
 * button reading "Finish Payout Setup", which is both wrong and the most
 * discouraging possible moment to be wrong at.
 */
export type PayoutStatus = "none" | "incomplete" | "pending" | "enabled";

export type PayoutState = {
  status: PayoutStatus;
  /** Requirement keys Stripe wants from the seller now, for "incomplete". */
  currentlyDue: string[];
  /** Stripe's own reason the account can't pay out yet, when it gives one. */
  disabledReason: string | null;
};

const NO_ACCOUNT: PayoutState = {
  status: "none",
  currentlyDue: [],
  disabledReason: null,
};

/**
 * Read onboarding state off a retrieved account.
 *
 * Sellers are paid by transfer and pay out to a bank, so "working" is
 * payouts_enabled + an active transfers capability. charges_enabled (card
 * processing) is deliberately NOT required: it depends on card_payments, a
 * capability these accounts never request, so requiring it would pin every
 * seller at "incomplete" forever.
 */
export function derivePayoutState(account: Stripe.Account): PayoutState {
  const currentlyDue = account.requirements?.currently_due ?? [];
  const disabledReason = account.requirements?.disabled_reason ?? null;

  if (account.payouts_enabled && account.capabilities?.transfers === "active") {
    return { status: "enabled", currentlyDue: [], disabledReason: null };
  }
  // Form submitted and Stripe is asking for nothing: the ball is in Stripe's
  // court (identity/bank verification), not the seller's.
  if (account.details_submitted && currentlyDue.length === 0) {
    return { status: "pending", currentlyDue: [], disabledReason };
  }
  return { status: "incomplete", currentlyDue, disabledReason };
}

/**
 * Resolve a seller's Connect account, returning null when there isn't a usable
 * one. A stored id can be unusable — most commonly it was created under a
 * different Stripe mode (a test-mode `acct_...` is invalid against live keys and
 * vice-versa), which makes every later call throw "No such account". Callers
 * treat null as "provision a fresh account".
 */
export async function retrieveConnectAccount(
  connectId: string | null | undefined,
): Promise<Stripe.Account | null> {
  if (!connectId) return null;
  try {
    return await requireStripe().accounts.retrieve(connectId);
  } catch (e) {
    logStripeError("payout/retrieve", e, { connectId });
    return null;
  }
}

/**
 * Stamp the two funnel timestamps, once each and never cleared.
 *
 * Guarded on the column still being null so this is idempotent across the many
 * renders that call it, and so a re-connect can't rewrite the original dates.
 * Best-effort: a failed stamp must never break the page that triggered it.
 */
async function stampPayoutMilestones(
  userId: string,
  status: PayoutStatus,
): Promise<void> {
  const now = new Date();
  try {
    // An account exists, so onboarding was started at some point. This is also
    // the backfill for sellers who started before these columns existed; fresh
    // accounts are stamped at creation time in the connect route.
    await prisma.user.updateMany({
      where: { id: userId, stripeConnectStartedAt: null },
      data: { stripeConnectStartedAt: now },
    });
    if (status === "enabled") {
      await prisma.user.updateMany({
        where: { id: userId, stripePayoutsEnabledAt: null },
        data: { stripePayoutsEnabledAt: now },
      });
    }
  } catch (e) {
    console.error("[payout] could not stamp funnel milestones", { userId }, e);
  }
}

/**
 * Real onboarding state for a seller's Connect account, for the dashboard card.
 *
 * A stored connect id only means an account was *created* — Stripe won't let us
 * transfer funds until onboarding is finished. Best-effort: if Stripe is
 * unconfigured or the account can't be read we report "incomplete" so the UI
 * nudges setup rather than falsely claiming a working payout account. That
 * fallback used to be silent, which made a systemic Stripe outage look
 * identical to "nobody connected"; every path out of it now logs.
 */
export async function getPayoutState(
  user: { id: string; stripeConnectId: string | null } | null | undefined,
): Promise<PayoutState> {
  if (!user?.stripeConnectId) return NO_ACCOUNT;

  const account = await retrieveConnectAccount(user.stripeConnectId);
  if (!account) {
    return { status: "incomplete", currentlyDue: [], disabledReason: null };
  }

  const state = derivePayoutState(account);
  void stampPayoutMilestones(user.id, state.status);
  return state;
}

/**
 * Log a Stripe failure with the diagnostics that make it reproducible: `param`
 * names the offending field and `requestId` is searchable in the Stripe
 * Dashboard. Shared so every Connect path reports failures the same way.
 */
export function logStripeError(
  scope: string,
  e: unknown,
  context: Record<string, unknown> = {},
): void {
  const err = e as Partial<InstanceType<typeof Stripe.errors.StripeError>>;
  console.error(
    `[${scope}] failed:`,
    JSON.stringify({
      message: e instanceof Error ? e.message : String(e),
      type: err.type,
      code: err.code,
      param: err.param,
      statusCode: err.statusCode,
      stripeRequestId: err.requestId,
      ...context,
    }),
  );
}

/**
 * Public base URL for the links Stripe redirects sellers back to.
 *
 * `||`, not `??`: NEXT_PUBLIC_* is inlined at build time, and a build that
 * didn't receive the arg inlines "" — which is not nullish, so `??` kept the
 * empty string and Stripe rejected "/dashboard" as "Not a valid URL".
 */
export function connectBaseUrl(req: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(
    /\/$/,
    "",
  );
}

/**
 * Mint a fresh Express onboarding link.
 *
 * `refresh_url` points at our own refresh endpoint rather than straight back at
 * /dashboard. Account links are single-use and expire within minutes, so the
 * old bare-/dashboard target silently dropped every seller whose link went
 * stale mid-form back onto the same button with no explanation — Stripe's
 * documented pattern is for refresh_url to re-mint and continue.
 */
export async function createOnboardingLink(
  connectId: string,
  baseUrl: string,
): Promise<string> {
  const link = await requireStripe().accountLinks.create({
    account: connectId,
    refresh_url: `${baseUrl}/api/stripe/connect/refresh`,
    return_url: `${baseUrl}/dashboard?connected=1`,
    type: "account_onboarding",
  });
  return link.url;
}

export type ResolvedConnectAccount = {
  connectId: string;
  state: PayoutState;
  /** True when this call created the Express account. */
  provisioned: boolean;
};

/**
 * Get the signed-in seller a usable Connect account, creating one if needed.
 *
 * Shared by the connect and refresh routes so an expired link resumes against
 * exactly the account the first click provisioned. Returns null only when the
 * user row is missing.
 */
export async function resolveConnectAccount(
  userId: string,
): Promise<ResolvedConnectAccount | null> {
  const stripe = requireStripe();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  // A stored id that no longer resolves (most often created under the other
  // Stripe key mode) is treated as absent and re-provisioned, rather than left
  // to 500 the account-link call with "No such account".
  const existing = await retrieveConnectAccount(user.stripeConnectId);
  if (existing) {
    const state = derivePayoutState(existing);
    void stampPayoutMilestones(user.id, state.status);
    return { connectId: existing.id, state, provisioned: false };
  }

  // Sellers are paid via separate transfers from the platform balance (see
  // captureAndPay), so they only need the `transfers` capability + a payout
  // bank account. Requesting `card_payments` would drag them through full
  // card-processing verification they don't need — and, because that keeps
  // `charges_enabled` false, would make onboarding never look "complete".
  const created = await stripe.accounts.create({
    type: "express",
    email: user.email,
    capabilities: { transfers: { requested: true } },
  });
  await prisma.user.update({
    where: { id: user.id },
    // Stamped here rather than on the seller's return: this is the moment
    // onboarding actually starts, and most sellers who drop out never come back
    // to be counted anywhere else.
    data: { stripeConnectId: created.id, stripeConnectStartedAt: new Date() },
  });
  return {
    connectId: created.id,
    state: derivePayoutState(created),
    provisioned: true,
  };
}

/**
 * Capture the held sale PaymentIntent and transfer the seller's proceeds to
 * their connected account (platform keeps the platform fee + shipping).
 * If the seller hasn't completed Stripe Connect onboarding, funds are captured
 * to the platform and the transfer is skipped.
 *
 * Fee math: `platformFeeCents` on the order row was computed by
 * computeSaleFees (src/lib/fees.ts) at checkout, and the seller's proceeds
 * are `itemCents - platformFeeCents` exactly as SaleFeeBreakdown defines
 * them. The stored figure is used rather than recomputed so a later change to
 * PLATFORM_FEE_PCT can never alter what an already-placed order pays out.
 *
 * Returns whether the seller leg actually landed. Capture and payout can
 * succeed independently, and the caller must not tell a seller they were paid
 * when only the capture went through.
 */
export async function captureAndPay(orderId: string): Promise<{ paidOut: boolean }> {
  const stripe = requireStripe();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    // Only the Connect destination is needed from the seller row.
    include: { seller: { select: { stripeConnectId: true } } },
  });
  if (!order || !order.stripePaymentIntentId) {
    throw new Error("Order or payment intent missing");
  }

  let pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
  if (pi.status === "requires_capture") {
    try {
      pi = await stripe.paymentIntents.capture(order.stripePaymentIntentId);
    } catch (e) {
      // A concurrent webhook may have captured it between our retrieve and
      // capture. Re-check and only rethrow if it's genuinely not captured, so
      // buyer receipt-confirmation doesn't fail on a harmless race.
      const fresh = await stripe.paymentIntents.retrieve(
        order.stripePaymentIntentId,
      );
      if (fresh.status !== "succeeded") throw e;
      pi = fresh;
    }
  }
  // Hard gate: the seller is only ever paid from this order's captured charge.
  // Any other intent state (canceled — e.g. the ~7-day card authorization
  // expired before the buyer confirmed — requires_action, processing) means no
  // money was collected, and transferring would spend the platform's own
  // balance.
  if (pi.status !== "succeeded") {
    throw new Error(
      `order ${order.id}: payment intent is "${pi.status}", not captured — cannot release funds`,
    );
  }
  const chargeId =
    typeof pi.latest_charge === "string"
      ? pi.latest_charge
      : (pi.latest_charge?.id ?? null);

  let transferId: string | null = order.stripeTransferId ?? null;
  if (!transferId && order.seller.stripeConnectId) {
    try {
      // Seller nets the item price minus the platform fee (the fee is taken
      // from their proceeds, not added to the buyer's total). Guard against a
      // negative/oversized transfer from any bad stored value.
      const sellerProceedsCents = Math.max(
        0,
        order.itemCents - order.platformFeeCents,
      );
      // Idempotency key ensures a retried/concurrent captureAndPay for the same
      // order never creates a second transfer — Stripe returns the original.
      // source_transaction ties the transfer to this order's charge so it can
      // only draw on those funds (and never needs pre-existing platform float).
      const transfer = await stripe.transfers.create(
        {
          amount: sellerProceedsCents,
          currency: "usd",
          destination: order.seller.stripeConnectId,
          metadata: { orderId: order.id },
          ...(chargeId ? { source_transaction: chargeId } : {}),
        },
        { idempotencyKey: `transfer_${order.id}` },
      );
      transferId = transfer.id;
    } catch (e) {
      // Buyer's money IS captured to the platform at this point; only the
      // seller leg failed (Connect onboarding incomplete, transfers disabled).
      // Say so loudly — this order needs a manual payout.
      console.error(
        `payout: transfer to seller ${order.sellerId} FAILED for order ${order.id} — funds captured but not paid out`,
        e,
      );
      transferId = null;
    }
  }

  // Only persist a real transfer id; never overwrite an existing one with null
  // (a later retry can complete the payout once onboarding finishes).
  if (transferId && transferId !== order.stripeTransferId) {
    await prisma.order.update({
      where: { id: order.id },
      data: { stripeTransferId: transferId },
    });
  }

  return { paidOut: transferId !== null };
}

/**
 * Release the held payment for a shipped order: mark it complete, capture the
 * buyer's payment, and transfer the seller's proceeds.
 *
 * Two independent things trigger this — the carrier reporting the parcel
 * delivered, and the buyer pressing "confirm receipt" — so the status
 * transition is CLAIMED FIRST with a guarded update. Exactly one caller wins;
 * the loser no-ops instead of double-paying. If the capture then fails (e.g.
 * the ~7-day authorization expired), the claim is rolled back so the order
 * returns to SHIPPED_TO_BUYER and stays retryable rather than being marked
 * complete on money that was never collected.
 */
export type ReleaseResult = { released: boolean; reason?: string };

export async function releaseEscrow(orderId: string): Promise<ReleaseResult> {
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, status: "SHIPPED_TO_BUYER" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (claimed.count === 0) {
    return { released: false, reason: "order is not awaiting release" };
  }

  let paidOut: boolean;
  try {
    ({ paidOut } = await captureAndPay(orderId));
  } catch (e) {
    await prisma.order.updateMany({
      where: { id: orderId, status: "COMPLETED" },
      data: { status: "SHIPPED_TO_BUYER", completedAt: null },
    });
    throw e;
  }

  // Only claim "you've been paid" when the transfer actually landed. A capture
  // that succeeded without its seller leg (Connect onboarding incomplete) is
  // already logged loudly by captureAndPay and is identifiable by a null
  // stripeTransferId on a COMPLETED order; emailing the seller a payout figure
  // they haven't received would bury that.
  if (paidOut) void notify.orderCompleted(orderId);
  return { released: true };
}

/**
 * Undo an order's payment at Stripe. Returns what actually happened so the
 * caller can pick the right terminal status and message:
 *
 *   "hold-released"      the authorization was cancelled — the buyer was never
 *                        charged, so there is nothing to refund
 *   "refunded"           a captured charge was refunded to the buyer
 *   "nothing-to-refund"  no live payment existed (never paid, already undone)
 *
 * Idempotency-keyed, so a double-submit can never refund twice.
 */
export type RefundOutcome = "hold-released" | "refunded" | "nothing-to-refund";

export async function refundOrderPayment(
  orderId: string,
): Promise<RefundOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { stripePaymentIntentId: true, stripeTransferId: true },
  });
  if (!order) throw new Error("Order missing");
  if (!order.stripePaymentIntentId) return "nothing-to-refund";

  const stripe = requireStripe();
  const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);

  // Authorized but never captured: cancelling the intent frees the hold on the
  // buyer's card. No money ever moved, so there is nothing to refund.
  if (
    pi.status === "requires_capture" ||
    pi.status === "requires_payment_method" ||
    pi.status === "requires_confirmation" ||
    pi.status === "requires_action"
  ) {
    await stripe.paymentIntents.cancel(pi.id).catch(() => undefined);
    return "hold-released";
  }

  if (pi.status !== "succeeded") return "nothing-to-refund";

  // Defensive: proceeds should not have been transferred before a terminal
  // state, but if one exists, claw it back first — refunding the charge while
  // the seller keeps the transfer would leave the platform out of pocket.
  if (order.stripeTransferId) {
    try {
      await stripe.transfers.createReversal(
        order.stripeTransferId,
        { metadata: { orderId } },
        { idempotencyKey: `reversal_${orderId}` },
      );
    } catch (e) {
      console.error(
        `refund: could not reverse transfer ${order.stripeTransferId} for order ${orderId} — refusing to refund and leave the platform short`,
        e,
      );
      throw e;
    }
  }

  await stripe.refunds.create(
    { payment_intent: pi.id, metadata: { orderId } },
    { idempotencyKey: `refund_${orderId}` },
  );
  return "refunded";
}
