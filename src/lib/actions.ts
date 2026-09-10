"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { releaseEscrow, refundOrderPayment } from "@/lib/payout";
import {
  buySaleLabel,
  createTracker,
  isEasyPostConfigured,
  shipFromAddress,
} from "@/lib/shipping";
import { guestTokenMatches } from "@/lib/orderState";
import type { OrderStatus } from "@prisma/client";
import * as notify from "@/lib/notify";

// --- Marketplace sale (direct, funds held until receipt) ---

export async function sellerMarkShipped(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;
  const orderId = String(formData.get("orderId"));
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.sellerId !== session.user.id) return;
  if (order.status !== "AWAITING_SHIP_TO_BUYER") return;

  // "Shipped" is what unlocks the buyer's escrow-release button, so shipping
  // evidence is required — a blank carrier/tracking would advance the escrow
  // clock with nothing for support to adjudicate a dispute against.
  const carrier = String(formData.get("carrier") ?? "").trim();
  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim();
  if (!carrier || !trackingNumber) {
    redirect(
      `/orders/${orderId}?toast=${encodeURIComponent(
        "Enter the carrier and tracking number to mark this shipped.",
      )}&toastKind=error`,
    );
  }

  // Guarded + transactional: a double-submit can't advance the order twice or
  // write a duplicate shipment event.
  const advanced = await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: "AWAITING_SHIP_TO_BUYER" },
      data: { status: "SHIPPED_TO_BUYER", shippedAt: new Date() },
    });
    if (res.count === 0) return false;
    await tx.shipmentEvent.create({
      data: {
        orderId,
        carrier,
        trackingNumber,
        status: "IN_TRANSIT",
      },
    });
    return true;
  });
  if (advanced) {
    void notify.orderShipped(orderId); // fire before redirect() throws
    // Register the seller's tracking number with the carrier feed so a
    // delivery scan can release escrow on its own. Best-effort and
    // fire-and-forget: unrecognised codes just mean the buyer's confirm
    // button stays the only release path, exactly as before.
    void createTracker(trackingNumber, carrier);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/dashboard");
  redirect(`/orders/${orderId}?toast=Marked+shipped+%E2%80%94+tracking+shared+with+the+buyer`);
}

/**
 * Buy a shipping label for a sale through EasyPost and mark the order shipped.
 *
 * The buyer's shipping charge stays with the platform (the seller's payout is
 * the item price minus the fee), so the platform pays for the label — this is
 * the path that makes that fair to the seller. The label is emailed nowhere;
 * it lives on the order page's shipment trail. EasyPost auto-creates a tracker
 * for labels it sells, so the delivery scan reaches our webhook without a
 * separate createTracker call.
 */
export async function sellerBuyLabel(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;
  const orderId = String(formData.get("orderId") ?? "");
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      seller: {
        select: {
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      },
      listing: { select: { isLot: true, lotItems: { select: { quantity: true } } } },
    },
  });
  if (!order || order.sellerId !== session.user.id) return;
  if (order.status !== "AWAITING_SHIP_TO_BUYER") return;

  const fail = (msg: string): never =>
    redirect(`/orders/${orderId}?toast=${encodeURIComponent(msg)}&toastKind=error`);

  if (!isEasyPostConfigured()) {
    return fail("Label purchase isn't available right now — ship it yourself and enter the tracking number.");
  }
  const from = shipFromAddress(order.seller);
  if (!from) {
    return fail("Add your ship-from address in Edit Profile to buy labels here.");
  }
  const itemCount = order.listing.isLot
    ? Math.max(1, order.listing.lotItems.reduce((n, it) => n + it.quantity, 0))
    : 1;
  const bought = await buySaleLabel(
    from,
    {
      name: order.shipName,
      line1: order.shipLine1,
      line2: order.shipLine2,
      city: order.shipCity,
      state: order.shipState,
      postalCode: order.shipPostalCode,
      country: order.shipCountry,
    },
    itemCount,
  );
  if (!bought || !bought.tracking) {
    return fail("We couldn't buy a label for this address. Ship it yourself and enter the tracking number below.");
  }

  // The label is real postage, so its record is written regardless of the
  // status claim; only the transition is guarded, so a manual "mark shipped"
  // racing this can't advance the order twice.
  const advanced = await prisma.$transaction(async (tx) => {
    await tx.shipmentEvent.create({
      data: {
        orderId,
        carrier: bought.carrier || null,
        trackingNumber: bought.tracking,
        labelUrl: bought.labelUrl || null,
        status: "LABEL_PURCHASED",
      },
    });
    const res = await tx.order.updateMany({
      where: { id: orderId, status: "AWAITING_SHIP_TO_BUYER" },
      data: { status: "SHIPPED_TO_BUYER", shippedAt: new Date() },
    });
    return res.count > 0;
  });
  if (advanced) void notify.orderShipped(orderId);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/dashboard");
  redirect(
    `/orders/${orderId}?toast=${encodeURIComponent(
      "Label bought — print it from the shipment panel. The buyer has the tracking number.",
    )}`,
  );
}

export async function buyerConfirmReceipt(formData: FormData) {
  const orderId = String(formData.get("orderId"));
  const token = String(formData.get("token") ?? "");
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  // The buyer is either the signed-in account that placed the order, or a
  // guest holding the order's secret token (emailed at checkout).
  const session = await auth();
  const isAccountBuyer =
    !!order.buyerId && order.buyerId === session?.user?.id;
  const isGuestBuyer = guestTokenMatches(token, order.guestToken);
  if (!isAccountBuyer && !isGuestBuyer) return;
  if (order.status !== "SHIPPED_TO_BUYER") return;

  const tokenQs = isGuestBuyer ? `&t=${encodeURIComponent(token)}` : "";
  try {
    // Shared with the delivery webhook. Claims the status transition first, so
    // if the carrier already reported delivery and released this order, the
    // click simply no-ops instead of paying the seller twice. On a capture
    // failure the order stays SHIPPED_TO_BUYER and remains retryable.
    await releaseEscrow(orderId);
  } catch (e) {
    console.error(`confirmReceipt: capture/payout failed for order ${orderId}`, e);
    redirect(
      `/orders/${orderId}?toast=${encodeURIComponent(
        "We couldn't release the payment. Please try again, or contact support if it keeps failing.",
      )}&toastKind=error${tokenQs}`,
    );
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/dashboard");
  redirect(
    `/orders/${orderId}?toast=Receipt+confirmed+%E2%80%94+payment+released+to+the+seller${tokenQs}`,
  );
}

// Who may cancel, and until when. A seller can call off a sale they haven't
// shipped; once a parcel is in transit only an admin can, because someone has
// to adjudicate where the goods are. COMPLETED/REFUNDED/CANCELLED are terminal.
const SELLER_CANCELLABLE: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID_ESCROW",
  "AWAITING_SHIP_TO_BUYER",
];
const ADMIN_CANCELLABLE: OrderStatus[] = [
  ...SELLER_CANCELLABLE,
  "SHIPPED_TO_BUYER",
];

/**
 * Cancel an order and give the buyer their money back.
 *
 * Before this existed there was no way to return a payment at all: a sale that
 * couldn't be fulfilled just sat in escrow until the card authorization
 * expired. Stripe does the right thing per state — an uncaptured hold is
 * cancelled (the buyer is never charged), a captured charge is refunded — and
 * the reserved unit goes back on the market.
 */
export async function cancelAndRefundOrder(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;
  const orderId = String(formData.get("orderId") ?? "");
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const isAdmin = session.user.role === "ADMIN";
  const isSeller = order.sellerId === session.user.id;
  if (!isAdmin && !isSeller) return;

  const allowed = isAdmin ? ADMIN_CANCELLABLE : SELLER_CANCELLABLE;
  if (!allowed.includes(order.status)) {
    redirect(
      `/orders/${orderId}?toast=${encodeURIComponent(
        order.status === "SHIPPED_TO_BUYER"
          ? "This order has already shipped — contact support to arrange a return."
          : "This order can no longer be cancelled.",
      )}&toastKind=error`,
    );
  }

  // Money first: only claim the terminal status once Stripe has actually
  // undone the payment, so the order can never read "refunded" on a refund
  // that failed. Idempotency keys make a double-submit safe at Stripe.
  let outcome;
  try {
    outcome = await refundOrderPayment(orderId);
  } catch (e) {
    console.error(`cancelAndRefundOrder: refund failed for order ${orderId}`, e);
    redirect(
      `/orders/${orderId}?toast=${encodeURIComponent(
        "We couldn't return the payment. Nothing was changed — please try again or contact support.",
      )}&toastKind=error`,
    );
  }

  // Guarded so two submissions can't both hand the unit back (phantom stock).
  const finalStatus: OrderStatus =
    outcome === "refunded" ? "REFUNDED" : "CANCELLED";
  const applied = await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: { in: allowed } },
      data: { status: finalStatus },
    });
    if (res.count === 0) return false;
    await tx.listing.updateMany({
      where: { id: order.listingId },
      data: { quantity: { increment: 1 } },
    });
    // Suspension only REMOVEs a seller's ACTIVE listings, so one that was
    // SOLD out at the time would otherwise be put back on the market here.
    await tx.listing.updateMany({
      where: {
        id: order.listingId,
        status: "SOLD",
        quantity: { gt: 0 },
        seller: { is: { suspended: false } },
      },
      data: { status: "ACTIVE" },
    });
    return true;
  });

  if (applied) void notify.orderRefunded(orderId, outcome);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/dashboard");
  revalidatePath(`/listings/${order.listingId}`);
  redirect(
    `/orders/${orderId}?toast=${encodeURIComponent(
      outcome === "refunded"
        ? "Order cancelled — the buyer has been refunded."
        : "Order cancelled — the payment hold was released, so the buyer was never charged.",
    )}`,
  );
}

// --- Seller: delete a listing ---
//
// A "delete" is a SOFT delete (status → REMOVED), never a row delete: listings
// are referenced by orders, offers, and reviews, and destroying one would
// break buyers' order history and payout records. REMOVED listings are already
// filtered from Browse and the seller's manager, no-indexed, and 404'd by the
// JSON API — so to everyone they're gone, while the paper trail survives.
// Owner-or-admin only; idempotent.
export type DeleteListingResult = { ok: boolean; error?: string };

export async function deleteListing(
  formData: FormData,
): Promise<DeleteListingResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in required." };

  const id = String(formData.get("listingId") ?? "");
  if (!id) return { ok: false, error: "Missing listing." };

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, sellerId: true, status: true },
  });
  if (!listing) return { ok: false, error: "Listing not found." };

  const isOwner = listing.sellerId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";
  if (!isOwner && !isAdmin) return { ok: false, error: "Not your listing." };

  if (listing.status !== "REMOVED") {
    await prisma.listing.update({
      where: { id },
      data: { status: "REMOVED" },
    });
  }

  // No revalidatePath: every page here is force-dynamic, so there's no cache
  // entry to invalidate, and a bare action call (not a form submission) gets
  // no re-rendered tree back either way. RemovableRow hides the row
  // optimistically and calls router.refresh() to reconcile the rest.
  return { ok: true };
}
