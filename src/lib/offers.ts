"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { computeSaleFees, SHIPPING_LEG_CENTS } from "@/lib/fees";
import { rateSaleShipping } from "@/lib/shipping";
import * as notify from "@/lib/notify";

const OFFER_TTL_DAYS = 7;

function ttl(): Date {
  return new Date(Date.now() + OFFER_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// Lightweight money + status validation; the form already constrains
// via input attributes but server-side stays authoritative.
function validateOfferInput(rawCents: number, listingPriceCents: number) {
  if (!Number.isInteger(rawCents) || rawCents <= 0) return "Enter a valid offer.";
  if (rawCents > listingPriceCents) return "Offer must be below the listing price.";
  if (rawCents < 100) return "Offer must be at least $1.";
  return null;
}

// Build an Order at the locked-in offer price.
// Mirrors the shape of /api/checkout's order creation: itemCents + platform
// fee + flat shipping leg, with shipping address pulled from
// the buyer's profile (fallback to a stub the buyer can edit pre-pay).
async function createOrderFromOffer(args: {
  offerId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  priceCents: number;
  autoAccepted: boolean;
}) {
  const buyer = await prisma.user.findUnique({ where: { id: args.buyerId } });
  if (!buyer) throw new Error("Buyer disappeared.");

  // Live-rate shipping from the seller's ship-from ZIP to the buyer's saved
  // address (flat fallback when either side lacks one). Rated BEFORE the
  // transaction — EasyPost must never hold DB locks.
  const seller = await prisma.user.findUnique({
    where: { id: args.sellerId },
    select: { shipFromPostalCode: true },
  });
  const shipRate = buyer.postalCode
    ? await rateSaleShipping(seller?.shipFromPostalCode, {
        name: buyer.name,
        line1: buyer.addressLine1 ?? "",
        city: buyer.city ?? "",
        state: buyer.state ?? "",
        postalCode: buyer.postalCode,
      })
    : { cents: SHIPPING_LEG_CENTS, rated: false };

  const fees = computeSaleFees(args.priceCents, shipRate.cents);

  return prisma.$transaction(async (tx) => {
    // Claim the offer's PENDING -> accepted transition FIRST, guarded, so one
    // offer can only ever produce one order. The quantity guard below protects
    // the listing, not the offer: with stock to spare, two concurrent accepts
    // of the SAME offer both reserved a unit and both created an order, and
    // the second overwrote offer.orderId — orphaning the first, which then sat
    // on a unit until the abandoned-reservation sweep reclaimed it.
    const claimed = await tx.offer.updateMany({
      where: { id: args.offerId, status: "PENDING" },
      data: {
        status: args.autoAccepted ? "AUTO_ACCEPTED" : "ACCEPTED",
        decidedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new Error("That offer has already been decided.");
    }

    // Reserve one unit atomically: the guarded decrement means two
    // concurrent accepts (or an accept racing an auto-accept) can't both
    // take the last unit — the loser's updateMany matches nothing.
    const reserved = await tx.listing.updateMany({
      where: { id: args.listingId, status: "ACTIVE", quantity: { gt: 0 } },
      data: { quantity: { decrement: 1 } },
    });
    if (reserved.count === 0) {
      throw new Error("Listing is no longer available.");
    }
    // Last unit reserved -> off the market.
    const soldOut = await tx.listing.updateMany({
      where: { id: args.listingId, quantity: { lte: 0 } },
      data: { status: "SOLD" },
    });

    const order = await tx.order.create({
      data: {
        listingId: args.listingId,
        buyerId: args.buyerId,
        sellerId: args.sellerId,
        itemCents: fees.itemCents,
        platformFeeCents: fees.platformFeeCents,
        shipToBuyerCents: fees.shipToBuyerCents,
        totalCents: fees.totalCents,
        status: "PENDING_PAYMENT",
        shipName: buyer.name,
        shipLine1: buyer.addressLine1 ?? "—",
        shipLine2: buyer.addressLine2 ?? null,
        shipCity: buyer.city ?? "—",
        shipState: buyer.state ?? "—",
        shipPostalCode: buyer.postalCode ?? "—",
        shipCountry: buyer.country ?? "US",
      },
    });

    // Status/decidedAt were set by the claim above; link the order it produced.
    await tx.offer.update({
      where: { id: args.offerId },
      data: { orderId: order.id },
    });

    // Supersede other PENDING offers only when the last unit is gone —
    // while stock remains, other buyers' offers can still be accepted.
    if (soldOut.count > 0) {
      await tx.offer.updateMany({
        where: {
          listingId: args.listingId,
          status: "PENDING",
          NOT: { id: args.offerId },
        },
        data: { status: "SUPERSEDED", decidedAt: new Date() },
      });
    }

    return order;
  });
}

export async function makeOffer(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin?next=/browse");

  const listingId = String(formData.get("listingId") ?? "").trim();
  const priceDollars = Number(formData.get("price") ?? 0);
  const message = String(formData.get("message") ?? "").trim().slice(0, 500);

  if (!listingId) return;
  if (!Number.isFinite(priceDollars)) {
    redirect(
      `/listings/${listingId}?toast=${encodeURIComponent("Enter a valid offer amount.")}&toastKind=error`,
    );
  }

  const priceCents = Math.round(priceDollars * 100);

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      sellerId: true,
      priceCents: true,
      status: true,
      minAutoAcceptCents: true,
    },
  });
  // Every dead end gets a visible outcome — a bare return here looks like a
  // broken button to the buyer.
  if (!listing) {
    redirect(
      `/browse?toast=${encodeURIComponent("That listing no longer exists.")}&toastKind=error`,
    );
  }
  if (listing.status !== "ACTIVE") {
    redirect(
      `/listings/${listingId}?toast=${encodeURIComponent("This listing is no longer available for offers.")}&toastKind=error`,
    );
  }
  if (listing.sellerId === session.user.id) {
    redirect(
      `/listings/${listingId}?toast=${encodeURIComponent("You can't make an offer on your own listing.")}&toastKind=error`,
    );
  }

  // An accepted offer turns into an order shipped to the buyer's saved
  // address — require one up front so an accepted sale never materializes
  // addressed to "—" with no way for the seller to ship it.
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { addressLine1: true, city: true, state: true, postalCode: true },
  });
  if (!me?.addressLine1 || !me.city || !me.state || !me.postalCode) {
    redirect(
      `/listings/${listingId}?toast=${encodeURIComponent(
        "Add your shipping address (Dashboard → Edit Profile) before making offers — an accepted offer becomes an order shipped to it.",
      )}&toastKind=error`,
    );
  }

  const err = validateOfferInput(priceCents, listing.priceCents);
  if (err) {
    redirect(
      `/listings/${listingId}?toast=${encodeURIComponent(err)}&toastKind=error`,
    );
  }

  // Buyer's existing PENDING offer on this listing → mark SUPERSEDED so
  // the new one is the only live offer.
  await prisma.offer.updateMany({
    where: {
      listingId,
      buyerId: session.user.id,
      status: "PENDING",
    },
    data: { status: "SUPERSEDED", decidedAt: new Date() },
  });

  const offer = await prisma.offer.create({
    data: {
      listingId,
      buyerId: session.user.id,
      priceCents,
      message: message || null,
      status: "PENDING",
      expiresAt: ttl(),
    },
  });

  // Auto-accept path: seller pre-authorized any offer ≥ their floor.
  if (
    listing.minAutoAcceptCents !== null &&
    listing.minAutoAcceptCents !== undefined &&
    priceCents >= listing.minAutoAcceptCents
  ) {
    // createOrderFromOffer reserves the listing atomically and throws if it was
    // already sold between our ACTIVE check and here. On that race, don't 500 or
    // strand a PENDING offer on a SOLD listing — mark it superseded and tell the
    // buyer the item just sold.
    let orderId: string | null = null;
    try {
      const order = await createOrderFromOffer({
        offerId: offer.id,
        listingId: listing.id,
        buyerId: session.user.id,
        sellerId: listing.sellerId,
        priceCents,
        autoAccepted: true,
      });
      orderId = order.id;
    } catch {
      // Guarded on PENDING for the same reason as the manual accept path: a
      // lost claim race must not overwrite the status of an offer that another
      // request just accepted.
      await prisma.offer.updateMany({
        where: { id: offer.id, status: "PENDING" },
        data: { status: "SUPERSEDED", decidedAt: new Date() },
      });
    }
    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/dashboard");
    if (orderId)
      redirect(
        `/orders/${orderId}?toast=${encodeURIComponent("Offer accepted instantly — complete checkout below")}`,
      );
    redirect(
      `/listings/${listingId}?toast=${encodeURIComponent(
        "Sorry — that item just sold to another buyer.",
      )}&toastKind=error`,
    );
  }

  void notify.offerReceived(offer.id); // alert the seller (non-auto-accept)
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/dashboard");
  redirect(
    `/listings/${listingId}?toast=${encodeURIComponent(
      `Offer sent — the seller has ${OFFER_TTL_DAYS} days to respond`,
    )}`,
  );
}

export async function acceptOffer(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;

  const offerId = String(formData.get("offerId") ?? "").trim();
  if (!offerId) return;

  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { listing: { select: { sellerId: true, status: true } } },
  });
  if (!offer) return;
  if (offer.listing.sellerId !== session.user.id) return;
  if (offer.status !== "PENDING") return;
  if (offer.listing.status !== "ACTIVE") return;
  if (offer.expiresAt < new Date()) {
    await prisma.offer.update({
      where: { id: offerId },
      data: { status: "EXPIRED", decidedAt: new Date() },
    });
    revalidatePath("/dashboard");
    redirect(
      `/dashboard?toast=${encodeURIComponent(
        "That offer expired before you could accept it.",
      )}&toastKind=error`,
    );
  }

  // Legacy pending offers can pre-date the address requirement in makeOffer —
  // never create an order that ships to "—".
  const buyer = await prisma.user.findUnique({
    where: { id: offer.buyerId },
    select: { addressLine1: true, city: true, state: true, postalCode: true },
  });
  if (!buyer?.addressLine1 || !buyer.city || !buyer.state || !buyer.postalCode) {
    redirect(
      `/dashboard?toast=${encodeURIComponent(
        "Can't accept yet — this buyer hasn't added a shipping address. Message them to complete their profile first.",
      )}&toastKind=error`,
    );
  }

  // createOrderFromOffer reserves the listing atomically and throws if it sold
  // between the ACTIVE check above and here. On that race, don't 500 the seller
  // — mark the offer superseded and tell them it just sold (mirrors the
  // auto-accept path in makeOffer).
  let created = false;
  try {
    await createOrderFromOffer({
      offerId,
      listingId: offer.listingId,
      buyerId: offer.buyerId,
      sellerId: offer.listing.sellerId,
      priceCents: offer.priceCents,
      autoAccepted: false,
    });
    created = true;
  } catch {
    // Guarded on PENDING: if the throw came from losing the claim race (this
    // offer was accepted a moment ago by a concurrent submit), an unguarded
    // write here would flip that live ACCEPTED offer to SUPERSEDED while its
    // order stood.
    await prisma.offer.updateMany({
      where: { id: offerId, status: "PENDING" },
      data: { status: "SUPERSEDED", decidedAt: new Date() },
    });
  }
  revalidatePath("/dashboard");
  revalidatePath(`/listings/${offer.listingId}`);
  if (created) {
    void notify.offerDecided(offerId, "accepted"); // tell the buyer
    redirect("/dashboard?toast=Offer+accepted+%E2%80%94+order+created");
  }
  redirect(
    `/dashboard?toast=${encodeURIComponent(
      "That item just sold to another buyer — the offer was closed.",
    )}&toastKind=error`,
  );
}

export async function rejectOffer(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;

  const offerId = String(formData.get("offerId") ?? "").trim();
  if (!offerId) return;

  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { listing: { select: { sellerId: true } } },
  });
  if (!offer) return;
  if (offer.listing.sellerId !== session.user.id) return;
  if (offer.status !== "PENDING") return;

  await prisma.offer.update({
    where: { id: offerId },
    data: { status: "REJECTED", decidedAt: new Date() },
  });

  void notify.offerDecided(offerId, "rejected"); // tell the buyer
  revalidatePath("/dashboard");
  redirect("/dashboard?toast=Offer+declined&toastKind=info");
}

// --- Buyer: clear a finished offer off the dashboard ---
//
// Like deleteListing, this is a SOFT delete: offers are the paper trail of a
// listing's negotiation and are surfaced in the admin user view, so the row
// stays and only the buyer's own "Offers I've sent" list stops showing it.
// Restricted to offers that ended without becoming an order — a PENDING offer
// is still live (reject/expiry closes it), and an accepted one is the record
// behind an order the buyer may still owe money on.
export type DismissOfferResult = { ok: boolean; error?: string };

export async function dismissOffer(
  formData: FormData,
): Promise<DismissOfferResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in required." };

  const offerId = String(formData.get("offerId") ?? "").trim();
  if (!offerId) return { ok: false, error: "Missing offer." };

  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      buyerId: true,
      status: true,
      orderId: true,
      dismissedAt: true,
    },
  });
  if (!offer) return { ok: false, error: "Offer not found." };
  if (offer.buyerId !== session.user.id)
    return { ok: false, error: "Not your offer." };
  if (offer.status === "PENDING")
    return { ok: false, error: "That offer is still live with the seller." };
  if (offer.orderId)
    return { ok: false, error: "This offer became an order — see Purchases." };

  // Idempotent: a double-submit shouldn't move the timestamp.
  if (!offer.dismissedAt) {
    await prisma.offer.update({
      where: { id: offerId },
      data: { dismissedAt: new Date() },
    });
  }

  // No revalidatePath here: /dashboard is force-dynamic, so there's no cache
  // entry to invalidate, and a bare action call (not a form submission) gets
  // no re-rendered tree back either way. RemovableRow hides the row
  // optimistically and calls router.refresh() to reconcile the rest.
  return { ok: true };
}

// Lazy expiry: called from views that list pending offers so we don't
// surface stale ones. Cheap because the index on (status, expiresAt)
// would only need a few rows updated per call.
// Throttled per instance: this runs from hot request paths (listing pages,
// dashboard), and offers only cross their expiry once a minute at most —
// per-request sweeps would just serialize writers on the same rows.
let lastOfferSweepAt = 0;

export async function expireStaleOffers() {
  const now = Date.now();
  if (now - lastOfferSweepAt < 60_000) return;
  lastOfferSweepAt = now;
  await prisma.offer.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED", decidedAt: new Date() },
  });
}
