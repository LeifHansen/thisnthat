import type { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { markOrderPaid } from "@/lib/actions";

// Stripe webhook: confirms payment and marks the order paid.
// Configure STRIPE_WEBHOOK_SECRET and point Stripe at /api/stripe/webhook.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;
    const paymentIntent =
      typeof session.payment_intent === "string" ? session.payment_intent : undefined;
    if (orderId) await markOrderPaid(orderId, paymentIntent);
  }

  return new Response("ok");
}
