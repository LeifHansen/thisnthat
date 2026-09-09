import { NextResponse } from "next/server";
import { currentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";
import { requireStripe } from "@/lib/stripe";
import { rateLimit } from "@/lib/rateLimit";
import { guestTokenMatches } from "@/lib/orderState";

/**
 * Start (or resume) payment for a single existing order — the pay path for
 * orders created outside the cart flow, i.e. accepted/auto-accepted offers.
 * The cart checkout authorizes a whole cart at once; here the buyer authorizes
 * one order at the price locked in when the offer was accepted.
 *
 * Idempotent: if the order already has a usable PaymentIntent we return its
 * client secret instead of creating a second one. The Stripe webhook advances
 * the order via the `metadata.orderId` fallback (see api/stripe/webhook).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(req, "order-pay", 20, 60_000);
  if (limited) return limited;

  let stripe;
  try {
    stripe = requireStripe();
  } catch {
    return NextResponse.json(
      { error: "Payments not configured (STRIPE_SECRET_KEY missing)." },
      { status: 503 },
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";

  const order = await prisma.order.findUnique({
    where: { id },
    include: { buyer: { select: { email: true } } },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // The payer is the signed-in account buyer, or a guest holding the order's
  // secret token (mirrors the access check on /orders/[id]).
  const user = await currentUser(req);
  const isAccountBuyer =
    !!order.buyerId && order.buyerId === user?.id;
  const isGuestBuyer = guestTokenMatches(token, order.guestToken);
  if (!isAccountBuyer && !isGuestBuyer) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  if (order.status !== "PENDING_PAYMENT") {
    return NextResponse.json(
      { error: "This order is no longer awaiting payment." },
      { status: 409 },
    );
  }

  const receiptEmail =
    order.buyer?.email ?? order.guestEmail ?? user?.email ?? undefined;

  // Reuse an existing PaymentIntent when it still has a live client secret, so
  // reloading the pay page doesn't strand a trail of duplicate intents.
  if (order.stripePaymentIntentId) {
    try {
      const existing = await stripe.paymentIntents.retrieve(
        order.stripePaymentIntentId,
      );
      const reusable = [
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "requires_capture",
      ];
      if (existing.client_secret && reusable.includes(existing.status)) {
        return NextResponse.json({ clientSecret: existing.client_secret });
      }
    } catch (e) {
      // Only a genuinely absent intent justifies minting a replacement. On a
      // transient Stripe error we must NOT fall through: the stored intent may
      // still be live, and pointing the order at a second intent would let the
      // buyer authorize one while release/capture reads the other.
      if ((e as { code?: string })?.code !== "resource_missing") {
        return NextResponse.json(
          { error: "Payment service unavailable. Please try again." },
          { status: 503 },
        );
      }
    }
  }

  const intent = await stripe.paymentIntents.create(
    {
      amount: order.totalCents,
      currency: "usd",
      capture_method: "manual",
      // `allow_redirects: "never"` is load-bearing, not a default. OrderCheckout
      // confirms with `redirect: "if_required"` and passes no `return_url`, so
      // the moment a redirect-based method (Klarna, Cash App Pay, Amazon Pay —
      // any of which an account owner can switch on in the Stripe Dashboard
      // without touching this repo) is offered by the Payment Element, the
      // buyer picks it and Stripe.js rejects the confirm outright. Restricting
      // the intent to non-redirect methods keeps the element and the client in
      // agreement. Re-enabling redirects means adding a `return_url` and
      // handling `redirect_status` on the way back first.
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      receipt_email: receiptEmail,
      metadata: {
        kind: "sale",
        orderId: order.id,
      },
      description: `Beanie Xchange order ${order.id}`,
    },
    // Collapses concurrent requests (two tabs, a double-tap) onto one
    // authorization. Keyed on the intent being replaced, so a legitimate
    // retry after the previous intent died still mints a fresh one.
    {
      idempotencyKey: `pay_${order.id}_${order.stripePaymentIntentId ?? "first"}`,
    },
  );

  await prisma.order.update({
    where: { id: order.id },
    data: { stripePaymentIntentId: intent.id },
  });

  return NextResponse.json({ clientSecret: intent.client_secret });
}
