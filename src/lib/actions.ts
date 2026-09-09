"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/guards";
import { releaseEscrow, refundOrderPayment } from "@/lib/payout";
import { buyReturnLabel, createTracker } from "@/lib/shipping";
import { guestTokenMatches } from "@/lib/orderState";
import type { OrderStatus } from "@prisma/client";
import * as notify from "@/lib/notify";

const rand = (n: number) =>
  crypto.randomUUID().replace(/-/g, "").slice(0, n).toUpperCase();

// --- Marketplace sale (direct, escrow) ---

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
      data: { status: "SHIPPED_TO_BUYER" },
    });
    if (res.count === 0) return false;
    await tx.shipmentEvent.create({
      data: {
        orderId,
        leg: "SELLER_TO_BUYER",
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

// --- Authentication module (admin) ---

/** Every request in the same batch as `r` (itself included); just `r` if unbatched. */
async function batchSiblingIds(r: { id: string; batchId: string | null }) {
  if (!r.batchId) return [r.id];
  const rows = await prisma.authenticationRequest.findMany({
    where: { batchId: r.batchId },
    select: { id: true },
  });
  return rows.map((x) => x.id);
}

export async function authReceiveAtCenter(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("authRequestId"));
  const r = await prisma.authenticationRequest.findUnique({ where: { id } });
  if (!r || r.status !== "AWAITING_INBOUND") return;

  await prisma.shipmentEvent.create({
    data: {
      authRequestId: id,
      leg: "SUBMITTER_TO_CENTER",
      carrier: String(formData.get("carrier") ?? ""),
      trackingNumber: String(formData.get("trackingNumber") ?? ""),
      status: "RECEIVED",
    },
  });
  // A batch is one box under one label, so receiving it receives every beanie
  // in it — the same thing the EasyPost delivery scan does. Before this the
  // admin had to click "received" once per beanie of a multi-beanie box.
  const siblingIds = await batchSiblingIds(r);
  await prisma.authenticationRequest.updateMany({
    where: { id: { in: siblingIds }, status: "AWAITING_INBOUND" },
    data: { status: "AT_CENTER" },
  });
  revalidatePath("/admin");
  for (const sid of siblingIds) revalidatePath(`/authenticate/${sid}`);
}

// The five components of a BX Full + Grading score, each 1–10. The overall
// grade is their average, rounded to the nearest half-point (PSA-style).
const GRADE_COMPONENTS = [
  "swingTag",
  "tushTag",
  "fabric",
  "fill",
  "cleanliness",
] as const;

export async function authReview(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("authRequestId"));
  const result = String(formData.get("result"));
  const notes = String(formData.get("notes") ?? "");
  // Only an explicit PASS or FAIL is actionable; anything else (missing or
  // malformed) must not fall through to the certificate-issuing PASS branch.
  if (result !== "PASS" && result !== "FAIL") return;

  const r = await prisma.authenticationRequest.findUnique({
    where: { id },
    include: { listing: true },
  });
  if (!r || (r.status !== "AT_CENTER" && r.status !== "IN_REVIEW")) return;

  if (result === "FAIL") {
    await prisma.authenticationRequest.update({
      where: { id },
      data: { status: "FAILED", reviewNotes: notes, reviewedAt: new Date() },
    });
    if (r.listingId) {
      await prisma.listing.update({
        where: { id: r.listingId },
        data: { status: "REMOVED" },
      });
    }
    revalidatePath("/admin");
    revalidatePath(`/authenticate/${id}`);
    return;
  }

  // PASS — branches by provider/tier:
  //   TRUE_BLUE                  → admin records True Blue's cert ID; we wrap it
  //                                with a BX registry number + the TB grade.
  //   BX_AUTHENTICATION / BASIC  → in-house authentication; cert + registry, no
  //                                grade (returned sealed in a mylar baggie).
  //   BX_AUTHENTICATION / FULL   → in-house grading; admin enters 5 sub-scores
  //                                and we roll them up to an overall /10.
  const isTrueBlue = r.provider === "TRUE_BLUE";
  const isGrading =
    r.provider === "BX_AUTHENTICATION" && r.tier === "FULL_GRADING";
  const trueBlueCertId = String(formData.get("trueBlueCertId") ?? "").trim();
  if (isTrueBlue && !trueBlueCertId) return; // TB pass requires the partner cert

  // Resolve the grade + optional component sub-scores.
  let grade: string | null = null;
  let gradeScores: Record<string, number> | null = null;
  if (isGrading) {
    const scores: Record<string, number> = {};
    for (const key of GRADE_COMPONENTS) {
      const v = Number(formData.get(`score_${key}`));
      if (!Number.isFinite(v) || v < 1 || v > 10) return; // all five required
      scores[key] = v;
    }
    const avg =
      GRADE_COMPONENTS.reduce((sum, k) => sum + scores[k], 0) /
      GRADE_COMPONENTS.length;
    grade = (Math.round(avg * 2) / 2).toFixed(1); // nearest half-point
    gradeScores = scores;
  } else if (isTrueBlue) {
    grade = String(formData.get("grade") ?? "").trim();
    if (!grade) return; // True Blue records the partner's grade
  }
  // Basic BX: grade stays null.

  const bxCertId = `BX-${new Date().getFullYear()}-${rand(8)}`;
  const registrationNumber = `BXR-${rand(6)}`;

  // Issue the cert/registry #, mark the request PASSED, and flip the listing to
  // ACTIVE with its badge — all atomically. A registrationNumber collision (it's
  // @unique) or any mid-sequence failure rolls the whole pass back rather than
  // leaving a registry row with no request, or a PASSED request whose listing
  // was never activated.
  await prisma.$transaction(async (tx) => {
    await tx.registryEntry.create({
      data: {
        registrationNumber,
        itemName: r.beanieName,
        grade,
        bxCertId,
        issuer: isTrueBlue ? "TRUE_BLUE" : "BX_AUTHENTICATION",
        externalCertId: isTrueBlue ? trueBlueCertId : null,
        ownerId: r.userId,
      },
    });

    await tx.authenticationRequest.update({
      where: { id },
      data: {
        status: "PASSED",
        bxCertId,
        grade,
        gradeScores: gradeScores ?? undefined,
        registrationNumber,
        reviewNotes: isTrueBlue
          ? `True Blue cert ${trueBlueCertId}${notes ? ` · ${notes}` : ""}`
          : notes || null,
        reviewedAt: new Date(),
      },
    });

    if (r.listingId) {
      await tx.listing.update({
        where: { id: r.listingId },
        data: {
          status: "ACTIVE",
          // Graded → flagship BX Verified; Basic → lighter BX · COA badge.
          authType: isTrueBlue
            ? "TRUE_BLUE"
            : isGrading
              ? "BX_FULL_SERVICE"
              : "BX_EXPRESS_COA",
          trueBlueCertId: isTrueBlue ? trueBlueCertId : null,
          bxCertId,
          grade,
          registrationNumber,
        },
      });
    }
  });
  revalidatePath("/admin");
  revalidatePath(`/authenticate/${id}`);
}

// --- New-beanie catalogue submissions (admin) ---

export async function approveBeanieSubmission(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("submissionId"));
  if (!id) return;
  await prisma.beanieSubmission.update({
    where: { id },
    data: { status: "APPROVED", reviewedAt: new Date() },
  });
  revalidatePath("/admin");
}

export async function rejectBeanieSubmission(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("submissionId"));
  if (!id) return;
  const notes = String(formData.get("notes") ?? "").trim();
  await prisma.beanieSubmission.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewNotes: notes || null },
  });
  revalidatePath("/admin");
}

export async function authRecordReturn(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("authRequestId"));
  const r = await prisma.authenticationRequest.findUnique({ where: { id } });
  if (!r || (r.status !== "PASSED" && r.status !== "FAILED")) return;

  let carrier = String(formData.get("carrier") ?? "");
  let trackingNumber = String(formData.get("trackingNumber") ?? "");
  let labelUrl: string | null = null;

  // Everything reviewed in this batch goes home together in one box: this
  // request plus every PASSED/FAILED sibling. A sibling still under review
  // stays behind and gets its own return when it is done. One label is
  // bought for the box, sized for its contents — previously a batch got no
  // label at all (to avoid buying one per beanie) and the admin had to buy
  // and type one by hand.
  const going = r.batchId
    ? await prisma.authenticationRequest.findMany({
        where: { batchId: r.batchId, status: { in: ["PASSED", "FAILED"] } },
        select: { id: true },
      })
    : [{ id }];
  const goingIds = going.map((g) => g.id);

  // Auto-buy the return label via EasyPost when we have the submitter's
  // address and the admin hasn't entered a tracking number by hand.
  if (
    !trackingNumber &&
    r.shipName &&
    r.shipLine1 &&
    r.shipCity &&
    r.shipState &&
    r.shipPostalCode
  ) {
    const bought = await buyReturnLabel(
      {
        name: r.shipName,
        line1: r.shipLine1,
        line2: r.shipLine2,
        city: r.shipCity,
        state: r.shipState,
        postalCode: r.shipPostalCode,
      },
      goingIds.length,
    );
    if (bought) {
      carrier = bought.carrier || carrier;
      trackingNumber = bought.tracking || trackingNumber;
      labelUrl = bought.labelUrl || null;
    }
  }

  // Recorded once, against the request the admin acted on; the submission
  // page reads shipments across the batch, so every beanie in the box shows
  // it.
  await prisma.shipmentEvent.create({
    data: {
      authRequestId: id,
      leg: "CENTER_TO_SUBMITTER",
      carrier,
      trackingNumber,
      labelUrl,
      status: "IN_TRANSIT",
    },
  });
  await prisma.authenticationRequest.updateMany({
    where: { id: { in: goingIds }, status: { in: ["PASSED", "FAILED"] } },
    data: { status: "RETURNED" },
  });
  revalidatePath("/admin");
  for (const gid of goingIds) revalidatePath(`/authenticate/${gid}`);
}
