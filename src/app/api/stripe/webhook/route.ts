import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import * as notify from "@/lib/notify";

export async function POST(req: Request) {
  let stripe;
  try {
    stripe = requireStripe();
  } catch {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured (STRIPE_WEBHOOK_SECRET missing)" },
      { status: 503 },
    );
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json(
      { error: `Webhook signature error: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  // A chargeback is the one event that can take money back out of a completed
  // sale, and the seller may already have been paid from it. There
  // is no automatic response that is safe here — reversing a transfer the
  // seller has spent, or refunding on top of a dispute we then win, both cost
  // real money — so this records rather than acts. Without it a dispute is
  // invisible to the app entirely: the first anyone hears of it is the Stripe
  // Dashboard, past the evidence deadline.
  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    const intentId =
      typeof dispute.payment_intent === "string"
        ? dispute.payment_intent
        : (dispute.payment_intent?.id ?? null);
    const order = intentId
      ? await prisma.order.findFirst({
          where: { stripePaymentIntentId: intentId },
          select: { id: true, status: true, stripeTransferId: true },
        })
      : null;
    console.error(
      "[stripe webhook] DISPUTE opened —",
      JSON.stringify({
        disputeId: dispute.id,
        amount: dispute.amount,
        reason: dispute.reason,
        // Stripe's own deadline for uploading evidence.
        evidenceDueBy: dispute.evidence_details?.due_by ?? null,
        paymentIntentId: intentId,
        orderId: order?.id ?? null,
        orderStatus: order?.status ?? null,
        // The expensive case: the buyer is clawing back funds the seller has
        // already been transferred, so the platform eats the gap unless the
        // dispute is contested or the transfer reversed.
        alreadyPaidOutToSeller: Boolean(order?.stripeTransferId),
      }),
    );
    return NextResponse.json({ received: true });
  }

  // Past this point the endpoint only acts on PaymentIntent events; ack
  // everything else (test events, account/charge webhooks) with a 200 so Stripe
  // doesn't retry, and so the cast below is sound.
  if (!event.type.startsWith("payment_intent.")) {
    return NextResponse.json({ received: true });
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  const kind = pi.metadata?.kind;

  // Sale: manual-capture authorization confirmed — the buyer's card is held
  // and the seller can ship. Each order has its own PaymentIntent
  // (metadata.orderId); the cartId lookup in ordersForIntent covers orders
  // from before that change.
  if (
    kind === "sale" &&
    (event.type === "payment_intent.amount_capturable_updated" ||
      event.type === "payment_intent.succeeded")
  ) {
    const orders = await ordersForIntent(pi);
    for (const order of orders) {
      // Guarded at write time, not against the snapshot above: the abandoned-
      // reservation sweep can cancel (and restock) this order concurrently,
      // and an unguarded update would resurrect a CANCELLED order whose unit
      // was already handed back.
      const advanced = await prisma.$transaction(async (tx) => {
        const res = await tx.order.updateMany({
          where: { id: order.id, status: "PENDING_PAYMENT" },
          data: { status: "AWAITING_SHIP_TO_BUYER" },
        });
        if (res.count === 0) return false;
        // The unit was already decremented at reservation; just enforce the
        // sold-out flip in case the listing sits at zero stock.
        await tx.listing.updateMany({
          where: { id: order.listingId, quantity: { lte: 0 } },
          data: { status: "SOLD" },
        });
        return true;
      });
      // Buyer receipt + seller "you sold" — fire-and-forget so a mail hiccup
      // can't fail the webhook (Stripe would retry and re-advance the order).
      if (advanced) void notify.orderPaid(order.id);
    }
  }

  // Only a terminal cancel releases the reservation. payment_intent.
  // payment_failed is deliberately NOT handled: it fires on every recoverable
  // decline (insufficient funds, 3-D Secure abandoned) while the intent stays
  // usable, and /api/orders/[id]/pay retries that same intent — cancelling
  // here would kill a sale on one soft decline. Truly abandoned reservations
  // are reclaimed by releaseAbandonedReservations().
  if (kind === "sale" && event.type === "payment_intent.canceled") {
    const orders = await ordersForIntent(pi);
    for (const order of orders) {
      // Guarded per order at write time: a duplicate delivery, or the
      // checkout rollback / sweep running concurrently, must not restock the
      // same unit twice (phantom inventory → oversell).
      await prisma.$transaction(async (tx) => {
        const res = await tx.order.updateMany({
          where: { id: order.id, status: "PENDING_PAYMENT" },
          data: { status: "CANCELLED" },
        });
        if (res.count === 0) return;
        await tx.listing.updateMany({
          where: { id: order.listingId },
          data: { quantity: { increment: 1 } },
        });
        // Never republish a suspended seller's listing (mirrors the guard in
        // sweepAbandonedReservations / cancelAndRefundOrder).
        await tx.listing.updateMany({
          where: {
            id: order.listingId,
            status: "SOLD",
            quantity: { gt: 0 },
            seller: { is: { suspended: false } },
          },
          data: { status: "ACTIVE" },
        });
      });
    }
  }

  return NextResponse.json({ received: true });
}

/**
 * Resolve the Order(s) backed by a sale PaymentIntent.
 *
 * Each order now has its own PaymentIntent (metadata.orderId), so that is the
 * primary key — advancing exactly one order per event. The cartId lookup is a
 * fallback for legacy orders created before the one-intent-per-order change,
 * when a whole cart shared a single PaymentIntent.
 */
async function ordersForIntent(pi: Stripe.PaymentIntent) {
  const orderId = pi.metadata?.orderId;
  if (orderId) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    return order ? [order] : [];
  }
  const cartId = pi.metadata?.cartId;
  if (cartId) return prisma.order.findMany({ where: { cartId } });
  return [];
}
