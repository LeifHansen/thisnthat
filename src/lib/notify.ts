import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { absoluteUrl } from "@/lib/site";
import { displayNameOf } from "@/lib/users";
import { sellerPath } from "@/lib/handles";
import { trackingUrl } from "@/lib/tracking";
import * as T from "@/lib/emailTemplates";

/**
 * The notification layer: each function loads what it needs, respects the
 * recipient's per-category preference, and sends a branded email. Every
 * function swallows its own errors and is meant to be fire-and-forget from a
 * server action:
 *
 *     void notify.orderPaid(order.id);
 *
 * so a mail hiccup can never fail (or slow) the order/offer/message that
 * triggered it. On Fly (a persistent Node server) the promise finishes after
 * the response is sent.
 */

type PrefKey =
  | "notifyOrders"
  | "notifyOffers"
  | "notifyMessages"
  | "notifySocial"
  | "notifyTips";

/** Lazily mint + persist a per-user unsubscribe token; return its manage URL. */
async function unsubUrl(userId: string): Promise<string | undefined> {
  try {
    const token = crypto.randomUUID();
    // Only claims the slot when still null, so concurrent sends don't clobber.
    await prisma.user.updateMany({
      where: { id: userId, unsubscribeToken: null },
      data: { unsubscribeToken: token },
    });
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { unsubscribeToken: true },
    });
    return u?.unsubscribeToken
      ? absoluteUrl(`/unsubscribe/${u.unsubscribeToken}`)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve a recipient account, gated on a preference flag. */
async function recipient(userId: string, pref: PrefKey) {
  const u = await prisma.user
    .findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        displayName: true,
        suspended: true,
        notifyOrders: true,
        notifyOffers: true,
        notifyMessages: true,
        notifySocial: true,
        notifyTips: true,
      },
    })
    .catch(() => null);
  if (!u || u.suspended || !u.email || !u[pref]) return null;
  return u;
}

async function deliver(
  to: string,
  built: { subject: string; html: string },
  category: string,
  args: Record<string, string>,
  unsubscribeUrl?: string,
) {
  await sendEmail({
    to,
    subject: built.subject,
    html: built.html,
    category,
    args,
    unsubscribeUrl,
  });
}

// ── Orders ────────────────────────────────────────────────────────────────

/** Payment authorized and held: buyer receipt (always — transactional) + seller alert. */
export async function orderPaid(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      // Narrow relations to what the emails read — the whole seller row was
      // fetched (and never used) on every paid order before.
      include: {
        listing: { select: { title: true } },
        buyer: { select: { email: true, name: true } },
      },
    });
    if (!order) return;
    const title = order.listing.title;

    // Buyer receipt — transactional, so it also goes to guest checkouts and
    // ignores the toggle (buyers must be able to find what they paid for).
    const buyerEmail = order.buyer?.email ?? order.guestEmail;
    if (buyerEmail) {
      await deliver(
        buyerEmail,
        T.orderPaidBuyer({
          buyerName: order.buyer?.name ?? order.shipName,
          itemTitle: title,
          priceCents: order.totalCents,
          orderId: order.id,
        }),
        "order",
        { orderId: order.id, kind: "paid_buyer" },
      );
    }

    // Seller "you sold" — gated on their order preference.
    const seller = await recipient(order.sellerId, "notifyOrders");
    if (seller) {
      const u = await unsubUrl(order.sellerId);
      await deliver(
        seller.email,
        T.orderPaidSeller({
          sellerName: seller.name,
          itemTitle: title,
          priceCents: order.itemCents,
          // Seller nets the sale price minus the platform fee.
          payoutCents: order.itemCents - order.platformFeeCents,
          orderId: order.id,
          unsubscribeUrl: u,
        }),
        "order",
        { orderId: order.id, kind: "paid_seller" },
        u,
      );
    }
  } catch (e) {
    console.error("[notify.orderPaid]", e);
  }
}

/** Seller marked shipped → tell the buyer. */
export async function orderShipped(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { select: { title: true } },
        buyer: { select: { email: true, name: true } },
        // The newest event carries the parcel's carrier + tracking number.
        shipmentEvents: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { carrier: true, trackingNumber: true },
        },
      },
    });
    if (!order) return;
    const buyerEmail = order.buyer?.email ?? order.guestEmail;
    if (!buyerEmail) return;
    const shipment = order.shipmentEvents[0];
    // Registered buyers can opt out; guests always get shipping updates.
    if (order.buyer) {
      const r = await recipient(order.buyerId!, "notifyOrders");
      if (!r) return;
    }
    const u = order.buyerId ? await unsubUrl(order.buyerId) : undefined;
    await deliver(
      buyerEmail,
      T.orderShippedBuyer({
        itemTitle: order.listing.title,
        orderId: order.id,
        carrier: shipment?.carrier,
        trackingNumber: shipment?.trackingNumber,
        trackingUrl: trackingUrl(shipment?.carrier, shipment?.trackingNumber),
        unsubscribeUrl: u,
      }),
      "order",
      { orderId: order.id, kind: "shipped" },
      u,
    );
  } catch (e) {
    console.error("[notify.orderShipped]", e);
  }
}

/** Delivered / buyer confirmed receipt → tell the seller they're paid. */
export async function orderCompleted(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: { select: { title: true } } },
    });
    if (!order) return;
    const seller = await recipient(order.sellerId, "notifyOrders");
    if (!seller) return;
    const u = await unsubUrl(order.sellerId);
    await deliver(
      seller.email,
      T.orderCompletedSeller({
        itemTitle: order.listing.title,
        // Payout = sale price minus the platform fee (matches captureAndPay).
        payoutCents: order.itemCents - order.platformFeeCents,
        orderId: order.id,
        unsubscribeUrl: u,
      }),
      "order",
      { orderId: order.id, kind: "completed" },
      u,
    );
  } catch (e) {
    console.error("[notify.orderCompleted]", e);
  }
}

// ── Mail damper ─────────────────────────────────────────────────────────

// Repeatable actions (follow/unfollow churn, re-offers) would otherwise let
// one account drive unbounded mail at a chosen recipient. At most one email
// per actor→recipient pair per window. In-memory per instance — a volume
// damper, not a security control.
const MAIL_DAMPER_MS = 6 * 60 * 60 * 1000;
// DMs get a shorter window than follow/offer churn: a burst of messages should
// collapse into one "you have a new message" email, but a genuinely new
// conversation later the same day still deserves its own alert.
const DM_DAMPER_MS = 15 * 60 * 1000;
const recentSocialMail = new Map<string, number>();
function mailDamped(key: string, windowMs: number = MAIL_DAMPER_MS): boolean {
  const now = Date.now();
  if (recentSocialMail.size > 5000) {
    for (const [k, t] of recentSocialMail) {
      if (now - t > MAIL_DAMPER_MS) recentSocialMail.delete(k);
    }
  }
  const last = recentSocialMail.get(key);
  if (last !== undefined && now - last < windowMs) return true;
  recentSocialMail.set(key, now);
  return false;
}

// ── Offers ──────────────────────────────────────────────────────────────

/** New offer → alert the seller. */
export async function offerReceived(offerId: string): Promise<void> {
  try {
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        listing: { select: { title: true, priceCents: true, sellerId: true, id: true } },
      },
    });
    if (!offer) return;
    if (mailDamped(`offer:${offer.buyerId}:${offer.listing.sellerId}`)) return;
    const seller = await recipient(offer.listing.sellerId, "notifyOffers");
    if (!seller) return;
    const u = await unsubUrl(offer.listing.sellerId);
    await deliver(
      seller.email,
      T.offerReceivedSeller({
        itemTitle: offer.listing.title,
        offerCents: offer.priceCents,
        listingPriceCents: offer.listing.priceCents,
        listingId: offer.listing.id,
        unsubscribeUrl: u,
      }),
      "offer",
      { offerId: offer.id, kind: "received" },
      u,
    );
  } catch (e) {
    console.error("[notify.offerReceived]", e);
  }
}

/** Offer accepted or rejected → tell the buyer. */
export async function offerDecided(
  offerId: string,
  outcome: "accepted" | "rejected",
): Promise<void> {
  try {
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: { select: { title: true, id: true } } },
    });
    if (!offer) return;
    const buyer = await recipient(offer.buyerId, "notifyOffers");
    if (!buyer) return;
    const u = await unsubUrl(offer.buyerId);
    const built =
      outcome === "accepted"
        ? T.offerAcceptedBuyer({
            itemTitle: offer.listing.title,
            offerCents: offer.priceCents,
            listingId: offer.listing.id,
            unsubscribeUrl: u,
          })
        : T.offerRejectedBuyer({
            itemTitle: offer.listing.title,
            offerCents: offer.priceCents,
            listingId: offer.listing.id,
            unsubscribeUrl: u,
          });
    await deliver(buyer.email, built, "offer", { offerId: offer.id, kind: outcome }, u);
  } catch (e) {
    console.error("[notify.offerDecided]", e);
  }
}

/**
 * Order cancelled: tell the buyer their money is coming back. Transactional —
 * it goes to guest checkouts too and ignores the notification toggle, because
 * someone whose payment was reversed must always be told.
 */
export async function orderRefunded(
  orderId: string,
  outcome: "refunded" | "hold-released" | "nothing-to-refund",
): Promise<void> {
  try {
    if (outcome === "nothing-to-refund") return; // no payment existed to report
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { select: { title: true } },
        buyer: { select: { email: true, name: true } },
      },
    });
    if (!order) return;
    const buyerEmail = order.buyer?.email ?? order.guestEmail;
    if (!buyerEmail) return;
    await deliver(
      buyerEmail,
      T.orderRefundedBuyer({
        buyerName: order.buyer?.name ?? order.shipName,
        itemTitle: order.listing.title,
        amountCents: order.totalCents,
        wasCharged: outcome === "refunded",
        orderId: order.id,
      }),
      "order",
      { orderId: order.id, kind: "refunded_buyer" },
    );
  } catch (e) {
    console.error("[notify.orderRefunded]", e);
  }
}

// ── Messages ────────────────────────────────────────────────────────────

/** New DM → email the recipient (skipped if they're actively unsubscribed). */
export async function newMessage(
  fromUserId: string,
  toUserId: string,
  body: string,
): Promise<void> {
  try {
    // Without this, one account can drive unbounded mail at a chosen
    // recipient by sending DMs in a loop (the send paths are only
    // per-instance rate limited, and the form action not at all).
    if (mailDamped(`msg:${fromUserId}:${toUserId}`, DM_DAMPER_MS)) return;
    const to = await recipient(toUserId, "notifyMessages");
    if (!to) return;
    const from = await prisma.user
      .findUnique({
        where: { id: fromUserId },
        select: { name: true, displayName: true },
      })
      .catch(() => null);
    if (!from) return;
    const u = await unsubUrl(toUserId);
    await deliver(
      to.email,
      T.newMessage({
        fromName: displayNameOf(from),
        preview: body,
        fromUserId,
        unsubscribeUrl: u,
      }),
      "message",
      { from: fromUserId, kind: "dm" },
      u,
    );
  } catch (e) {
    console.error("[notify.newMessage]", e);
  }
}

// ── Social ──────────────────────────────────────────────────────────────

/** New follower → notify the followed store owner. */
export async function newFollower(
  followerId: string,
  followedId: string,
): Promise<void> {
  try {
    if (mailDamped(`follow:${followerId}:${followedId}`)) return;
    const owner = await recipient(followedId, "notifySocial");
    if (!owner) return;
    const follower = await prisma.user
      .findUnique({
        where: { id: followerId },
        select: { id: true, name: true, displayName: true, handle: true },
      })
      .catch(() => null);
    if (!follower) return;
    const u = await unsubUrl(followedId);
    await deliver(
      owner.email,
      T.newFollower({
        followerName: displayNameOf(follower),
        followerPath: sellerPath(follower),
        unsubscribeUrl: u,
      }),
      "social",
      { followerId, kind: "follow" },
      u,
    );
  } catch (e) {
    console.error("[notify.newFollower]", e);
  }
}

/**
 * One-time nudge for accounts that never listed an item (sent by the
 * throttled sweep in lib/nudges.ts — never from a request path). Gated on the
 * "tips & nudges" preference.
 */
export async function firstListingNudge(userId: string): Promise<void> {
  try {
    const user = await recipient(userId, "notifyTips");
    if (!user) return;
    const u = await unsubUrl(userId);
    await deliver(
      user.email,
      T.firstListingNudge({ name: displayNameOf(user), unsubscribeUrl: u }),
      "nudge",
      { userId, kind: "first-listing" },
      u,
    );
  } catch (e) {
    console.error("[notify.firstListingNudge]", e);
  }
}

// ── Account ─────────────────────────────────────────────────────────────

/** Welcome email on signup (always sends — it's an account email). */
export async function welcome(email: string, name?: string | null): Promise<void> {
  try {
    await sendEmail({
      to: email,
      ...T.welcome({ name }),
      category: "account",
      args: { kind: "welcome" },
    });
  } catch (e) {
    console.error("[notify.welcome]", e);
  }
}
