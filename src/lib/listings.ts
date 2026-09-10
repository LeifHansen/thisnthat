import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireStripe } from "@/lib/stripe";
import * as notify from "@/lib/notify";
import type { ListingCardData } from "@/components/ListingCard";
import { getSellerRatings } from "@/lib/reviews";

/**
 * Free listings stranded SOLD by an abandoned checkout. Checkout reserves a
 * listing (ACTIVE → SOLD) before payment to prevent oversell; if the buyer never
 * pays and Stripe never fires a cancel/fail webhook (e.g. they just closed the
 * tab), the reservation would otherwise be permanent. This reverts a listing to
 * ACTIVE once its only holding order has sat PENDING_PAYMENT past the cutoff.
 * Called opportunistically from the marketplace/checkout paths — cheap, guarded,
 * and safe to run concurrently.
 */
async function releaseAbandonedReservations(
  olderThanMinutes = 30,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  let stale: {
    id: string;
    listingId: string;
    stripePaymentIntentId: string | null;
  }[];
  try {
    stale = await prisma.order.findMany({
      where: {
        status: "PENDING_PAYMENT",
        createdAt: { lt: cutoff },
        // Accepted-offer orders are paid on the buyer's own schedule — a
        // 30-minute sweep must not destroy an accepted sale.
        offer: { is: null },
      },
      select: { id: true, listingId: true, stripePaymentIntentId: true },
      take: 100,
    });
  } catch {
    return 0;
  }

  // Orders that never reached Stripe hold no money — reclaim directly.
  let freed = await runSweep(stale.filter((o) => !o.stripePaymentIntentId));

  // Orders WITH an intent may hold real money: an authorized hold whose
  // webhook was missed, or a 3-D Secure flow still completing. Ask Stripe
  // before touching them — advance the paid ones, leave the in-flight ones,
  // and reclaim the dead ones WITH their card authorization cancelled (never
  // strand a live hold on the buyer's card for rows we cancel).
  const withIntent = stale.filter((o) => o.stripePaymentIntentId).slice(0, 20);
  if (withIntent.length > 0) {
    let stripe;
    try {
      stripe = requireStripe();
    } catch {
      return freed;
    }
    for (const o of withIntent) {
      try {
        const pi = await stripe.paymentIntents.retrieve(
          o.stripePaymentIntentId as string,
        );
        if (pi.status === "requires_capture" || pi.status === "succeeded") {
          // Paid but never advanced (missed webhook) — a live sale, not an
          // abandoned one.
          await advancePaidOrder(o);
          continue;
        }
        if (pi.status === "processing" || pi.status === "requires_action") {
          continue; // still completing — check again next sweep
        }
        if (pi.status !== "canceled") {
          await stripe.paymentIntents.cancel(pi.id).catch(() => undefined);
        }
        freed += await runSweep([o]);
      } catch {
        // Stripe unreachable for this one — leave it for the next sweep.
      }
    }
  }
  return freed;
}

/**
 * Move one authorized-but-unadvanced order into the sold state, exactly as the
 * Stripe webhook does: the same guarded transition, the same sold-out flip, and
 * the same buyer-receipt / "you sold an item" emails.
 *
 * The emails are the part that is easy to forget and expensive to lose. For a
 * GUEST buyer the receipt is the only delivery of their order link + guestToken
 * — skip it and someone who has already been charged has no way back to the
 * order at all. Guarded on the transition winning, so the webhook and every
 * reconciliation pass together still send exactly one set.
 */
async function advancePaidOrder(order: {
  id: string;
  listingId: string;
}): Promise<boolean> {
  // Guarded at write time, not against a snapshot: the abandonment sweep can
  // cancel (and restock) this order concurrently, and an unguarded update would
  // resurrect a CANCELLED order whose unit was already handed back.
  const advanced = await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: "AWAITING_SHIP_TO_BUYER", paidAt: new Date() },
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
  // Outside the transaction and fire-and-forget, like the webhook: a mail
  // hiccup must not roll back a sale that really was paid for.
  if (advanced) void notify.orderPaid(order.id);
  return advanced;
}

/**
 * Advance orders that Stripe authorized but that never moved off
 * PENDING_PAYMENT — the state a missed `payment_intent` webhook delivery leaves
 * behind.
 *
 * releaseAbandonedReservations() already reconciles the orders IT looks at, but
 * it deliberately looks at a narrow slice: only orders past the abandonment
 * cutoff, and never offer-backed ones. That leaves a fresh cart authorization
 * and every accepted-offer payment with nothing to rescue them when the
 * webhook is unreachable. So this pass asks Stripe about every pending order
 * that has an intent and advances the authorized ones. It only ever moves an
 * order FORWARD — nothing here cancels, refunds or restocks.
 */
async function reconcilePaidOrders(): Promise<number> {
  let stripe;
  try {
    stripe = requireStripe();
  } catch {
    return 0;
  }

  let pending: {
    id: string;
    listingId: string;
    stripePaymentIntentId: string | null;
  }[];
  try {
    pending = await prisma.order.findMany({
      where: {
        status: "PENDING_PAYMENT",
        stripePaymentIntentId: { not: null },
        // A card authorization only lives ~7 days, so nothing older can still
        // be rescued; the window keeps dead intents from being re-read forever.
        createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, listingId: true, stripePaymentIntentId: true },
      orderBy: { createdAt: "desc" },
      // Bound the Stripe round-trips; older stragglers come up on later passes.
      take: 25,
    });
  } catch {
    return 0;
  }

  // Carts share one intent across their orders, so read each intent once and
  // apply its verdict to every order that points at it.
  const byIntent = new Map<string, { id: string; listingId: string }[]>();
  for (const o of pending) {
    const key = o.stripePaymentIntentId as string;
    const group = byIntent.get(key);
    if (group) group.push(o);
    else byIntent.set(key, [o]);
  }

  let advanced = 0;
  for (const [intentId, orders] of byIntent) {
    try {
      const pi = await stripe.paymentIntents.retrieve(intentId);
      if (pi.status !== "requires_capture" && pi.status !== "succeeded") {
        continue;
      }
      for (const o of orders) {
        if (await advancePaidOrder(o)) advanced++;
      }
    } catch {
      // Stripe unreadable for this intent — leave it for the next pass.
    }
  }
  return advanced;
}

async function runSweep(
  stale: { id: string; listingId: string }[],
): Promise<number> {
  let freed = 0;
  for (const o of stale) {
    try {
      const didFree = await prisma.$transaction(async (tx) => {
        const cancelled = await tx.order.updateMany({
          where: { id: o.id, status: "PENDING_PAYMENT" },
          data: { status: "CANCELLED" },
        });
        if (cancelled.count === 0) return false; // paid/cancelled meanwhile
        // Each cancelled order held exactly one unit — hand it back, then
        // put the listing back on the market if it was sold out.
        await tx.listing.updateMany({
          where: { id: o.listingId },
          data: { quantity: { increment: 1 } },
        });
        // Never republish a suspended seller's listing: suspension only
        // REMOVEs their ACTIVE ones, so a listing that was SOLD out at the
        // time survives and would otherwise return to Browse on this restock.
        await tx.listing.updateMany({
          where: {
            id: o.listingId,
            status: "SOLD",
            quantity: { gt: 0 },
            seller: { is: { suspended: false } },
          },
          data: { status: "ACTIVE" },
        });
        return true;
      });
      if (didFree) freed++;
    } catch {
      // A single stuck row shouldn't break the sweep.
    }
  }
  return freed;
}

// Throttle so a burst of page loads triggers at most one sweep per instance per
// window. Fire-and-forget: callers (marketplace pages) don't await it.
//
// Two passes, both reading Stripe as the source of truth for what actually
// happened to a pending order. Paid-but-unheard-of orders are advanced FIRST,
// so by the time the abandonment pass runs they no longer look pending; what
// is left really is abandoned. Each pass swallows its own failure so it can't
// take the other down with it.
let lastSweepAt = 0;
export function sweepAbandonedReservations(windowMs = 5 * 60_000): void {
  const now = Date.now();
  if (now - lastSweepAt < windowMs) return;
  lastSweepAt = now;
  void (async () => {
    await reconcilePaidOrders().catch(() => 0);
    await releaseAbandonedReservations().catch(() => 0);
  })();
}

// ── Storefront queries ───────────────────────────────────────────────

// Columns a ListingCard needs — keep queries lean.
export const CARD_SELECT = {
  id: true,
  title: true,
  priceCents: true,
  photos: true,
  condition: true,
  sellerId: true,
  status: true,
  quantity: true,
  isLot: true,
  categoryId: true,
} satisfies Prisma.ListingSelect;

/**
 * Attach each card's seller rating (average + review count) with one grouped
 * aggregate for the whole page, so a grid of 12 cards costs one extra query
 * rather than twelve. Sellers with no reviews get a null average and a zero
 * count, which the card renders as "No reviews yet".
 */
export async function withSellerRatings<T extends { sellerId: string }>(
  items: T[],
): Promise<(T & { sellerRating: ListingCardData["sellerRating"] })[]> {
  const ratings = await getSellerRatings(items.map((l) => l.sellerId));
  return items.map((l) => ({
    ...l,
    sellerRating: ratings.get(l.sellerId) ?? { avg: null, count: 0 },
  }));
}

/** Listings that are for sale right now: published with stock left. */
export const FOR_SALE: Prisma.ListingWhereInput = {
  status: "ACTIVE",
  quantity: { gt: 0 },
};

export type ListingSort = "newest" | "price_asc" | "price_desc";

const ORDER_BY: Record<ListingSort, Prisma.ListingOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }, { id: "desc" }],
  price_asc: [{ priceCents: "asc" }, { id: "desc" }],
  price_desc: [{ priceCents: "desc" }, { id: "desc" }],
};

/**
 * One page of for-sale listings matching `where`, plus the total so callers
 * can paginate. The default excludes lots (they get their own browse view);
 * pass `isLot: true` in `where` to page lots instead.
 */
export async function getListingsPage({
  where = {},
  skip,
  take,
  sort = "newest",
}: {
  where?: Prisma.ListingWhereInput;
  skip: number;
  take: number;
  sort?: ListingSort;
}): Promise<{ items: ListingCardData[]; total: number }> {
  const full: Prisma.ListingWhereInput = { isLot: false, ...where, ...FOR_SALE };
  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where: full,
      orderBy: ORDER_BY[sort],
      skip,
      take,
      select: CARD_SELECT,
    }),
    prisma.listing.count({ where: full }),
  ]);
  return { items: await withSellerRatings(rows), total };
}

// ── Lot listings ─────────────────────────────────────────────────────
// A lot is a single listing bundling several items. It renders as one card
// with a piece count.

export type LotCardData = ListingCardData & { pieces: number };

const LOT_SELECT = {
  ...CARD_SELECT,
  lotItems: { select: { quantity: true } },
} satisfies Prisma.ListingSelect;

/** Active lot listings (newest first) as cards, with total piece counts. */
export async function getLots(
  where: Prisma.ListingWhereInput = {},
): Promise<LotCardData[]> {
  const rows = await prisma.listing.findMany({
    where: { ...where, ...FOR_SALE, isLot: true },
    orderBy: { createdAt: "desc" },
    select: LOT_SELECT,
  });
  return withSellerRatings(
    rows.map(({ lotItems, ...card }) => ({
      ...card,
      pieces: lotItems.reduce((n, it) => n + it.quantity, 0),
    })),
  );
}

/** Count of active lots — cheap existence/badge check for entry points. */
export async function countActiveLots(): Promise<number> {
  try {
    return await prisma.listing.count({ where: { ...FOR_SALE, isLot: true } });
  } catch {
    return 0;
  }
}

/** Other for-sale listings from the same seller (newest first), excluding one. */
export async function getMoreFromSeller(
  sellerId: string,
  excludeId: string,
  take = 8,
): Promise<ListingCardData[]> {
  const rows = await prisma.listing.findMany({
    where: { ...FOR_SALE, sellerId, NOT: { id: excludeId } },
    orderBy: { createdAt: "desc" },
    take,
    select: CARD_SELECT,
  });
  return withSellerRatings(rows);
}

/** For-sale listings in the same category (newest first), excluding one. */
export async function getSimilarListings(
  categoryId: string,
  excludeId: string,
  take = 8,
): Promise<ListingCardData[]> {
  const rows = await prisma.listing.findMany({
    where: { ...FOR_SALE, categoryId, isLot: false, NOT: { id: excludeId } },
    orderBy: { createdAt: "desc" },
    take,
    select: CARD_SELECT,
  });
  return withSellerRatings(rows);
}

/** Per-category counts of for-sale listings, for browse tiles and facets. */
export async function countByCategory(
  where: Prisma.ListingWhereInput = {},
): Promise<Map<string, number>> {
  const rows = await prisma.listing.groupBy({
    by: ["categoryId"],
    where: { isLot: false, ...where, ...FOR_SALE },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.categoryId, r._count._all]));
}

/**
 * Postgres full-text search over title, description and brand. Returns the
 * matching ids (ranked) so callers can combine it with normal Prisma filters;
 * empty query → null (no filter).
 */
export async function searchListingIds(
  q: string,
  limit = 500,
): Promise<string[] | null> {
  const query = q.trim();
  if (!query) return null;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Listing"
    WHERE "status" = 'ACTIVE'
      AND to_tsvector('english', coalesce("title", '') || ' ' || coalesce("brand", '') || ' ' || coalesce("itemName", '') || ' ' || coalesce("description", ''))
          @@ websearch_to_tsquery('english', ${query})
    ORDER BY ts_rank(
      to_tsvector('english', coalesce("title", '') || ' ' || coalesce("brand", '') || ' ' || coalesce("itemName", '')),
      websearch_to_tsquery('english', ${query})
    ) DESC, "createdAt" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}
