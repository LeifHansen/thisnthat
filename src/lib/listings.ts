import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { requireStripe } from "@/lib/stripe";
import * as notify from "@/lib/notify";
import { firstRealPhoto } from "@/lib/photos";
import type { ListingCardData } from "@/components/ListingCard";

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

  // Orders WITH an intent may hold real money: an authorized escrow whose
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
 * cutoff, and never offer-backed ones (those are paid on the buyer's own
 * schedule, so a sweep must never touch them). That leaves the two cases a
 * broken webhook hits hardest with nothing to rescue them — a fresh cart
 * authorization, and every accepted-offer payment. The buyer's card holds the
 * money, the seller is never told to ship, nobody is emailed, and the
 * authorization expires unclaimed in about a week.
 *
 * So this pass asks Stripe about every pending order that has an intent and
 * advances the authorized ones. It only ever moves an order FORWARD — nothing
 * here cancels, refunds or restocks — which is what makes it safe to run over
 * the orders the abandonment sweep must leave alone.
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
        // Never-completed checkouts sit here indefinitely; without a window
        // every pass would re-read the same dead intents. A card authorization
        // only lives ~7 days, so nothing older can still be rescued.
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

  // Legacy carts share one intent across their orders, so read each intent once
  // and apply its verdict to every order that points at it.
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
// so by the time the abandonment pass runs they no longer look pending and it
// neither re-reads their intents nor has to consider reclaiming them; what is
// left really is abandoned. Each pass swallows its own failure so it can't
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

// Columns a ListingCard needs — keep queries lean.
const CARD_SELECT = {
  status: true,
  quantity: true,
  id: true,
  title: true,
  beanieName: true,
  priceCents: true,
  photos: true,
  authType: true,
  registrationNumber: true,
  grade: true,
  sellerId: true,
} satisfies Prisma.ListingSelect;

// ── Beanie "options" model ───────────────────────────────────────────
// Many sellers post the same beanie, so the storefront groups active
// listings by beanieName into a single card that shows a price range and an
// option count. Add-to-Cart grabs the cheapest; "Shop Options" opens them all.

export type BeanieOption = {
  beanieName: string;
  year: number | null;
  /** Cheapest listing's first real photo (what the card shows), or null. */
  photo: string | null;
  optionCount: number;
  minCents: number;
  maxCents: number;
  /** Cheapest active listing — used for Add to Cart, the card link, and badge. */
  cheapest: ListingCardData;
};

const GROUP_SELECT = {
  ...CARD_SELECT,
  year: true,
} satisfies Prisma.ListingSelect;

type GroupRow = Prisma.ListingGetPayload<{ select: typeof GROUP_SELECT }>;

function toCardData(r: GroupRow): ListingCardData {
  // Strip the extra `year` so the shape matches ListingCardData exactly.
  const { year: _year, ...card } = r;
  void _year;
  return card;
}

/**
 * Uncached core: scans all active listings matching `where` and groups them.
 * This is a full-table scan + in-JS group/sort, so callers go through the
 * cached wrapper below — every marketplace page (home, browse, each
 * infinite-scroll step of /api/listings) hits this, and recomputing the whole
 * grouping per request is O(n) DB + CPU per page served.
 */
async function computeBeanieGroups(
  where: Prisma.ListingWhereInput,
): Promise<BeanieOption[]> {
  const rows = await prisma.listing.findMany({
    // Lots are unique bundles, not one-of-many options for a single beanie, so
    // they're excluded here and surfaced through their own browse view.
    where: { ...where, status: "ACTIVE", quantity: { gt: 0 }, isLot: false },
    orderBy: { priceCents: "asc" },
    select: GROUP_SELECT,
  });

  const byName = new Map<string, GroupRow[]>();
  for (const r of rows) {
    const arr = byName.get(r.beanieName);
    if (arr) arr.push(r);
    else byName.set(r.beanieName, [r]);
  }

  const groups: BeanieOption[] = [];
  for (const [beanieName, list] of byName) {
    // `list` is already price-ascending (rows came back ordered).
    const cheapest = list[0];
    groups.push({
      beanieName,
      year: cheapest.year,
      photo: firstRealPhoto(cheapest.photos),
      optionCount: list.length,
      minCents: cheapest.priceCents,
      maxCents: list[list.length - 1].priceCents,
      cheapest: toCardData(cheapest),
    });
  }

  // Real-photo groups first, then the most-competitive (most options), then
  // alphabetical for stable ordering.
  groups.sort(
    (a, b) =>
      Number(!!b.photo) - Number(!!a.photo) ||
      b.optionCount - a.optionCount ||
      a.beanieName.localeCompare(b.beanieName),
  );
  return groups;
}

// Cached grouping, keyed by the serialized `where`. A short TTL keeps the
// storefront fresh (new listings appear within a minute) while collapsing the
// per-request full-table scans — infinite scroll in particular re-requested
// the entire grouping for every 12-item page. Also stabilizes offset
// pagination within the TTL window (no duplicated/skipped cards mid-scroll).
// BeanieOption is plain JSON (no Dates), so unstable_cache round-trips it.
const cachedBeanieGroups = unstable_cache(
  async (whereKey: string) =>
    computeBeanieGroups(JSON.parse(whereKey) as Prisma.ListingWhereInput),
  ["beanie-groups"],
  { revalidate: 60 },
);

/** Group all active listings (optionally filtered) into beanie options. */
export async function getBeanieGroups(
  where: Prisma.ListingWhereInput = {},
): Promise<BeanieOption[]> {
  try {
    return await cachedBeanieGroups(JSON.stringify(where));
  } catch {
    // Cache layer hiccup — fall back to the direct computation.
    return computeBeanieGroups(where);
  }
}

/** Paginated beanie options (groups are computed in full, then sliced). */
export async function getBeanieGroupsPage({
  where = {},
  skip,
  take,
}: {
  where?: Prisma.ListingWhereInput;
  skip: number;
  take: number;
}): Promise<{ items: BeanieOption[]; total: number }> {
  const all = await getBeanieGroups(where);
  return { items: all.slice(skip, skip + take), total: all.length };
}

/** A single purchasing option (one seller's listing) of a beanie. */
export type ListingOption = ListingCardData & { condition: string };

/** Other active listings of the same beanie (cheapest first), excluding one. */
export async function getOtherOptions(
  beanieName: string,
  excludeId: string,
  take = 12,
): Promise<ListingOption[]> {
  return prisma.listing.findMany({
    // quantity > 0 matches computeBeanieGroups: an ACTIVE listing can sit at
    // zero stock (an edit can land the count exactly on 0 without flipping the
    // status), and offering it here dead-ends the buyer at checkout.
    where: {
      status: "ACTIVE",
      quantity: { gt: 0 },
      beanieName,
      isLot: false,
      NOT: { id: excludeId },
    },
    orderBy: { priceCents: "asc" },
    take,
    select: { ...CARD_SELECT, condition: true },
  });
}

// ── Lot listings ─────────────────────────────────────────────────────
// A lot is a single listing bundling many beanies. It renders as one card
// (its own listing), never grouped, with a "N beanies" piece count.

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
    where: { ...where, status: "ACTIVE", quantity: { gt: 0 }, isLot: true },
    orderBy: { createdAt: "desc" },
    select: LOT_SELECT,
  });
  return rows.map(({ lotItems, ...card }) => ({
    ...card,
    pieces: lotItems.reduce((n, it) => n + it.quantity, 0),
  }));
}

/** Count of active lots — cheap existence/badge check for entry points. */
export async function countActiveLots(): Promise<number> {
  try {
    return await prisma.listing.count({
      where: { status: "ACTIVE", quantity: { gt: 0 }, isLot: true },
    });
  } catch {
    return 0;
  }
}

/** Similar beanies (other names) to suggest when an item has no other options. */
export async function getSimilarBeanies(
  beanieName: string,
  take = 8,
): Promise<BeanieOption[]> {
  // Read the ONE shared unfiltered group cache and exclude in JS. Passing
  // `beanieName: { not: ... }` as the where would mint a distinct cache entry
  // (and a full catalogue scan) per beanie name — near-zero hit rate on
  // exactly the long-tail listings that render this.
  const groups = await getBeanieGroups({});
  return groups.filter((g) => g.beanieName !== beanieName).slice(0, take);
}
