import { NextResponse } from "next/server";
import { currentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";
import { requireStripe } from "@/lib/stripe";
import { computeSaleFees } from "@/lib/fees";
import { rateSaleShipping } from "@/lib/shipping";
import { SITE_NAME } from "@/lib/site";
import { cartCheckoutSchema, firstError } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";
import { sweepAbandonedReservations } from "@/lib/listings";

const guestToken = () => crypto.randomUUID().replace(/-/g, "");

/**
 * Cart checkout. Accepts one or more listing ids, a single shipping address
 * (and, for guests, an email), and a Stripe PaymentMethod collected on the
 * client via the deferred Payment Element.
 *
 * Each listing becomes its own Order (with that listing's sellerId) and its
 * OWN manual-capture PaymentIntent, authorized here server-side against the
 * shared PaymentMethod. One PaymentIntent per order is what keeps the held
 * payment honest across sellers in a multi-seller cart: funds for each item
 * are captured only when THAT item is delivered or its receipt confirmed (see
 * lib/payout.ts), so confirming one item never releases another seller's
 * held funds. Every order ships direct, seller -> buyer.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "checkout", 20, 60_000);
  if (limited) return limited;

  // Free any abandoned reservations before we reserve (throttled, non-blocking).
  sweepAbandonedReservations();

  let stripe;
  try {
    stripe = requireStripe();
  } catch {
    return NextResponse.json(
      { error: "Payments not configured (STRIPE_SECRET_KEY missing)." },
      { status: 503 },
    );
  }

  const parsed = cartCheckoutSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const { listingIds, email, ship, paymentMethodId, checkoutId, expectedTotalCents } =
    parsed.data;

  // Cookie or mobile bearer token — the app checks out through this same
  // route, so it must not be read as a guest here.
  const buyer = await currentUser(req);
  const buyerId = buyer?.id ?? null;
  const isGuest = !buyerId;
  if (isGuest && !email) {
    return NextResponse.json(
      { error: "An email is required to check out as a guest." },
      { status: 400 },
    );
  }

  // De-dupe ids, then load only currently-buyable listings.
  const uniqueIds = [...new Set(listingIds)];
  const listings = await prisma.listing.findMany({
    where: { id: { in: uniqueIds }, status: "ACTIVE", quantity: { gt: 0 } },
    include: { seller: { select: { email: true } } },
  });
  // Sellers can't buy their own items — signed in (by id) or signed out
  // as a "guest" with their own account email (a reputation-laundering path:
  // self-purchases inflate sales counts and the sold ticker).
  const guestEmail = email?.toLowerCase() ?? null;
  const buyable = listings.filter(
    (l) =>
      l.sellerId !== buyerId &&
      (!guestEmail || l.seller.email.toLowerCase() !== guestEmail),
  );
  if (buyable.length === 0) {
    // `listings` already filtered to ACTIVE matches, so if we found some but
    // none are buyable, they're all the shopper's own listings.
    const error =
      listings.length > 0
        ? "You can't buy your own listing — only other sellers' items can be purchased."
        : "These items are no longer available.";
    return NextResponse.json({ error }, { status: 400 });
  }

  // The client's checkoutId doubles as the cartId, making the POST idempotent:
  // a double-click or network-level retry of an attempt that already produced
  // live orders is refused instead of re-charging. Cancelled orders don't
  // count — after a rolled-back decline the same id may retry cleanly.
  const cartId = checkoutId ?? crypto.randomUUID();
  if (checkoutId) {
    const existing = await prisma.order.findFirst({
      where: { cartId: checkoutId, status: { not: "CANCELLED" } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error:
            "This checkout was already submitted — check your orders before paying again.",
        },
        { status: 409 },
      );
    }
  }

  // Live-rate each order's shipping from the seller's ship-from ZIP to the
  // buyer's address (flat fallback inside rateSaleShipping). Rated in
  // parallel BEFORE the reservation transaction — EasyPost calls must never
  // hold DB locks.
  const sellerZips = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...new Set(buyable.map((l) => l.sellerId))] } },
        select: { id: true, shipFromPostalCode: true },
      })
    ).map((u) => [u.id, u.shipFromPostalCode]),
  );
  const perOrder = await Promise.all(
    buyable.map(async (l) => {
      const rate = await rateSaleShipping(sellerZips.get(l.sellerId), {
        name: ship.name,
        line1: ship.line1,
        line2: ship.line2,
        city: ship.city,
        state: ship.state,
        postalCode: ship.postalCode,
      });
      return { listing: l, fees: computeSaleFees(l.priceCents, rate.cents) };
    }),
  );

  // Consent check: never authorize an amount the buyer didn't see. The cart
  // snapshot only controls what's DISPLAYED — prices and shipping are
  // recomputed live here, so a seller price change (or an item silently
  // dropping out of `buyable`) between render and click would otherwise be
  // charged without the buyer ever seeing the new number.
  if (expectedTotalCents !== undefined) {
    const serverTotalCents = perOrder.reduce((s, p) => s + p.fees.totalCents, 0);
    if (serverTotalCents !== expectedTotalCents) {
      return NextResponse.json(
        {
          error:
            "Your cart's total changed (an item sold, or a price or shipping rate was updated). Review your cart and try again.",
        },
        { status: 409 },
      );
    }
  }

  // Reserve every listing AND create its order in one transaction. Reserving
  // (decrement a unit, guarded by quantity > 0) inside the tx is what
  // prevents oversell: concurrent buyers each take a distinct unit, and once
  // the last unit is reserved the listing flips to SOLD so no further tx can
  // decrement. A reservation left unpaid is freed later by
  // releaseAbandonedReservations().
  let orders: Awaited<ReturnType<typeof prisma.order.create>>[];
  try {
    orders = await prisma.$transaction(async (tx) => {
      const created: Awaited<ReturnType<typeof prisma.order.create>>[] = [];
      for (const { listing, fees } of perOrder) {
        const reserved = await tx.listing.updateMany({
          where: { id: listing.id, status: "ACTIVE", quantity: { gt: 0 } },
          data: { quantity: { decrement: 1 } },
        });
        if (reserved.count === 0) {
          throw new Error("ITEM_UNAVAILABLE");
        }
        // Last unit reserved → off the market.
        await tx.listing.updateMany({
          where: { id: listing.id, quantity: { lte: 0 } },
          data: { status: "SOLD" },
        });
        created.push(
          await tx.order.create({
            data: {
              listingId: listing.id,
              buyerId,
              guestEmail: isGuest ? email : null,
              guestToken: isGuest ? guestToken() : null,
              cartId,
              sellerId: listing.sellerId,
              itemCents: fees.itemCents,
              platformFeeCents: fees.platformFeeCents,
              shipToBuyerCents: fees.shipToBuyerCents,
              totalCents: fees.totalCents,
              status: "PENDING_PAYMENT",
              shipName: ship.name,
              shipLine1: ship.line1,
              shipLine2: ship.line2 ?? null,
              shipCity: ship.city,
              shipState: ship.state,
              shipPostalCode: ship.postalCode,
              shipCountry: "US",
            },
          }),
        );
      }
      return created;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ITEM_UNAVAILABLE") {
      return NextResponse.json(
        {
          error:
            "One or more items in your cart just sold. Please refresh and review your cart.",
        },
        { status: 409 },
      );
    }
    // Two concurrent POSTs of the same checkoutId can both clear the findFirst
    // dedupe above; @@unique([cartId, listingId]) then rolls the loser back
    // (no double charge). Report it as the same "already submitted" 409 rather
    // than a 500 — the reservation the winner made is the real state.
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        {
          error:
            "This checkout was already submitted — check your orders before paying again.",
        },
        { status: 409 },
      );
    }
    throw e;
  }

  const receiptEmail = email ?? buyer?.email ?? undefined;

  // A PaymentMethod can only back multiple PaymentIntents once it's attached to
  // a Customer, so mint an ephemeral customer for this checkout and attach it.
  let customerId: string;
  try {
    const customer = await stripe.customers.create(
      {
        email: receiptEmail,
        metadata: { cartId },
      },
      // Keyed on the cart so a network-level retry re-uses the customer the
      // first attempt made. Without this, the retry mints a second customer,
      // the PaymentMethod gets attached there instead, and the per-order
      // intents below are created against a customer the caller has already
      // forgotten — one orphan customer per retried checkout.
      { idempotencyKey: `cust_${cartId}` },
    );
    customerId = customer.id;
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  } catch {
    await releaseCart(cartId);
    return NextResponse.json(
      { error: "We couldn't start payment. Please try again." },
      { status: 502 },
    );
  }

  // Authorize one manual-capture PaymentIntent per order. Any hard decline rolls
  // the whole cart back (cancel every authorization, release every reservation)
  // so the buyer is never left paying for part of a cart.
  const createdIntents: { intentId: string; orderId: string }[] = [];
  const requiresAction: { orderId: string; clientSecret: string }[] = [];
  try {
    for (const order of orders) {
      const intent = await stripe.paymentIntents.create(
        {
          amount: order.totalCents,
          currency: "usd",
          capture_method: "manual",
          customer: customerId,
          payment_method: paymentMethodId,
          confirm: true,
          off_session: false,
          // We confirm server-side, so disallow redirect-based methods.
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
          receipt_email: receiptEmail,
          metadata: { kind: "sale", orderId: order.id, cartId },
          description: `${SITE_NAME} order ${order.id}`,
        },
        // One authorization per order, ever — a network-level retry of this
        // call can't double-authorize the buyer's card.
        { idempotencyKey: `pi_${order.id}` },
      );
      createdIntents.push({ intentId: intent.id, orderId: order.id });
      await prisma.order.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: intent.id },
      });

      if (intent.status === "requires_capture") {
        continue; // authorized and held — the happy path
      }
      if (intent.status === "requires_action" && intent.client_secret) {
        // Card needs 3-D Secure; the client finishes it with handleNextAction.
        requiresAction.push({
          orderId: order.id,
          clientSecret: intent.client_secret,
        });
        continue;
      }
      throw new Error("This card was not authorized.");
    }
  } catch (e) {
    // Only cancel authorizations whose order is still pending. An order the
    // webhook already advanced (paid, awaiting shipment) must keep its
    // authorization — cancelling it would leave a live order backed by a
    // dead PaymentIntent, and releaseCart below skips advanced orders too.
    const stillPending = new Set(
      (
        await prisma.order.findMany({
          where: {
            id: { in: createdIntents.map((c) => c.orderId) },
            status: "PENDING_PAYMENT",
          },
          select: { id: true },
        })
      ).map((o) => o.id),
    );
    await Promise.allSettled(
      createdIntents
        .filter((c) => stillPending.has(c.orderId))
        .map((c) => stripe.paymentIntents.cancel(c.intentId).catch(() => undefined)),
    );
    await releaseCart(cartId);
    const isCard =
      typeof e === "object" &&
      e !== null &&
      (e as { type?: string }).type === "StripeCardError";
    return NextResponse.json(
      {
        error: isCard
          ? (e as { message?: string }).message ?? "Your card was declined."
          : "Payment could not be completed.",
      },
      { status: 402 },
    );
  }

  return NextResponse.json({
    cartId,
    requiresAction,
    orders: orders.map((o) => ({ id: o.id, guestToken: o.guestToken })),
  });
}

/**
 * Undo a failed checkout: cancel its still-unpaid orders and release the
 * listings it reserved (SOLD → ACTIVE), mirroring the abandoned-reservation
 * sweep so a payment failure never leaves an item stuck off the market.
 */
async function releaseCart(cartId: string) {
  try {
    const stuck = await prisma.order.findMany({
      where: { cartId, status: "PENDING_PAYMENT" },
      select: { id: true, listingId: true },
    });
    // Per-order, guarded at write time: the Stripe cancel webhook can run
    // this same rollback concurrently, and an unguarded cancel + increment
    // pair would restock the same unit twice (phantom inventory → oversell).
    for (const o of stuck) {
      await prisma.$transaction(async (tx) => {
        const res = await tx.order.updateMany({
          where: { id: o.id, status: "PENDING_PAYMENT" },
          data: { status: "CANCELLED" },
        });
        if (res.count === 0) return;
        await tx.listing.updateMany({
          where: { id: o.listingId },
          data: { quantity: { increment: 1 } },
        });
        // Never republish a suspended seller's listing (mirrors the guard in
        // sweepAbandonedReservations / cancelAndRefundOrder).
        await tx.listing.updateMany({
          where: {
            id: o.listingId,
            status: "SOLD",
            quantity: { gt: 0 },
            seller: { is: { suspended: false } },
          },
          data: { status: "ACTIVE" },
        });
      });
    }
  } catch (e) {
    console.error("[checkout] releaseCart failed:", e);
  }
}
