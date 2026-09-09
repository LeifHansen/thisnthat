import type { ListingStatus, OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

// Display order for the status filters and the overview breakdowns. Prisma
// exports the enums as unordered objects, so the order is pinned here.
export const LISTING_STATUSES: readonly ListingStatus[] = [
  "ACTIVE",
  "DRAFT",
  "SOLD",
  "REMOVED",
];

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID_ESCROW",
  "AWAITING_SHIP_TO_BUYER",
  "SHIPPED_TO_BUYER",
  "COMPLETED",
  "REFUNDED",
  "CANCELLED",
];

// Order statuses where the buyer's money has been captured — held in escrow
// or already paid out. Pending carts and cancellations are excluded so they
// can't inflate the paid-order count.
export const CAPTURED_STATUSES: readonly OrderStatus[] = [
  "PAID_ESCROW",
  "AWAITING_SHIP_TO_BUYER",
  "SHIPPED_TO_BUYER",
  "COMPLETED",
];

// Captured but not settled: the money is still in escrow and the item is
// still with the seller or in transit.
export const IN_FLIGHT_STATUSES: readonly OrderStatus[] = [
  "PAID_ESCROW",
  "AWAITING_SHIP_TO_BUYER",
  "SHIPPED_TO_BUYER",
];

// A paid order the seller still hasn't shipped after this many days is the
// one thing on the marketplace that needs an admin to step in (nudge the
// seller, or cancel and refund the buyer). It's what the Orders nav badge
// counts.
export const STUCK_AFTER_DAYS = 7;

const UNSHIPPED: readonly OrderStatus[] = ["PAID_ESCROW", "AWAITING_SHIP_TO_BUYER"];

export function stuckCutoff(now = new Date()): Date {
  return new Date(now.getTime() - STUCK_AFTER_DAYS * 24 * 60 * 60 * 1000);
}

/** Work awaiting an admin on the Orders queue. */
export type QueueCounts = {
  /** Paid orders the seller hasn't shipped within STUCK_AFTER_DAYS. */
  stuck: number;
  /** Every order between payment and completion. */
  inFlight: number;
  /** What the Orders nav badge shows. */
  total: number;
};

export async function loadQueueCounts(): Promise<QueueCounts> {
  try {
    const [stuck, inFlight] = await Promise.all([
      prisma.order.count({
        where: {
          status: { in: [...UNSHIPPED] },
          createdAt: { lt: stuckCutoff() },
        },
      }),
      prisma.order.count({ where: { status: { in: [...IN_FLIGHT_STATUSES] } } }),
    ]);
    return { stuck, inFlight, total: stuck };
  } catch {
    return { stuck: 0, inFlight: 0, total: 0 };
  }
}

/** The Orders nav badge: orders that need an admin's attention. */
export async function loadQueueCount(): Promise<number> {
  return (await loadQueueCounts()).total;
}

export type CategoryCount = {
  id: string;
  slug: string;
  name: string;
  active: number;
  total: number;
};

export type Kpis = {
  users: number;
  /** Accounts created in the last 7 days. */
  newUsers7d: number;
  admins: number;
  suspended: number;
  listingsByStatus: Record<ListingStatus, number>;
  totalListings: number;
  ordersByStatus: Record<OrderStatus, number>;
  totalOrders: number;
  /** Orders whose payment was captured (in escrow or paid out). */
  paidOrders: number;
  completedOrders: number;
  /** Item value of COMPLETED orders — what has actually changed hands. */
  gmvCents: number;
  /** The platform's cut (PLATFORM_FEE_PCT of the item price) over COMPLETED orders. */
  revenueCents: number;
  /** Item value currently held in escrow: paid, not yet completed. */
  escrowCents: number;
  /** Open offers a seller still has to answer. */
  pendingOffers: number;
  /** Direct messages nobody has read yet. */
  unreadMessages: number;
  /**
   * Stripe Connect funnel. `payoutStarted` counts sellers who have an Express
   * account at all — it is written the instant they click the button, so it
   * means "started", not "connected". `payoutEnabled` counts the ones whose
   * payouts actually went live, and `sellers` is the denominator that turns
   * either into a rate. Without all three, a low connect count can't be told
   * apart from a low seller count.
   */
  sellers: number;
  payoutStarted: number;
  payoutEnabled: number;
  /** Listing counts per category, in the category tree's display order. */
  categories: CategoryCount[];
};

export type Trends = {
  /** ISO dates (UTC Mondays), oldest → newest. All series align to these. */
  weeks: string[];
  newUsers: number[];
  newListings: number[];
  /** Orders placed that week whose payment was captured. */
  paidOrders: number[];
  /** Item value of those paid orders. */
  gmvCents: number[];
  newOffers: number[];
  /** Sellers whose payouts went live that week (stripePayoutsEnabledAt). */
  payoutEnabled: number[];
};

type WeekRow = { wk: Date; n: number; cents?: number };

/**
 * Weekly growth series for the admin trends charts. One indexed pass per
 * table (grouped in SQL by ISO week), zero-filled in JS so every series has
 * a value for every week. Best-effort: returns null on any failure so the
 * overview renders without the charts rather than 500ing.
 */
export async function loadTrends(weeksBack = 12): Promise<Trends | null> {
  try {
    // Current ISO week's Monday (UTC), then back `weeksBack - 1` weeks —
    // matches Postgres date_trunc('week', …), which also starts Monday.
    const now = new Date();
    const monday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const dow = (monday.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    monday.setUTCDate(monday.getUTCDate() - dow);
    const start = new Date(monday);
    start.setUTCDate(start.getUTCDate() - (weeksBack - 1) * 7);

    const weeks: string[] = [];
    for (let i = 0; i < weeksBack; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i * 7);
      weeks.push(d.toISOString().slice(0, 10));
    }

    const [users, listings, orders, offers, payouts] = await Promise.all([
      prisma.$queryRaw<WeekRow[]>`
        SELECT date_trunc('week', "createdAt") AS wk, count(*)::int AS n
        FROM "User" WHERE "createdAt" >= ${start}
        GROUP BY 1`,
      prisma.$queryRaw<WeekRow[]>`
        SELECT date_trunc('week', "createdAt") AS wk, count(*)::int AS n
        FROM "Listing" WHERE "createdAt" >= ${start}
        GROUP BY 1`,
      prisma.$queryRaw<WeekRow[]>`
        SELECT date_trunc('week', "createdAt") AS wk, count(*)::int AS n,
               sum("itemCents")::int AS cents
        FROM "Order"
        WHERE "createdAt" >= ${start}
          AND status::text IN ('PAID_ESCROW','AWAITING_SHIP_TO_BUYER','SHIPPED_TO_BUYER','COMPLETED')
        GROUP BY 1`,
      prisma.$queryRaw<WeekRow[]>`
        SELECT date_trunc('week', "createdAt") AS wk, count(*)::int AS n
        FROM "Offer" WHERE "createdAt" >= ${start}
        GROUP BY 1`,
      // Sellers who finished Stripe onboarding, by the week it went live.
      // Only stamped from the deploy that added the column onward, so early
      // weeks read 0 rather than being unknown — expected, not a bug.
      prisma.$queryRaw<WeekRow[]>`
        SELECT date_trunc('week', "stripePayoutsEnabledAt") AS wk,
               count(*)::int AS n
        FROM "User" WHERE "stripePayoutsEnabledAt" >= ${start}
        GROUP BY 1`,
    ]);

    const fill = (rows: WeekRow[], pick: (r: WeekRow) => number) => {
      const byWeek = new Map(
        rows.map((r) => [r.wk.toISOString().slice(0, 10), pick(r)]),
      );
      return weeks.map((w) => byWeek.get(w) ?? 0);
    };

    return {
      weeks,
      newUsers: fill(users, (r) => r.n),
      newListings: fill(listings, (r) => r.n),
      paidOrders: fill(orders, (r) => r.n),
      gmvCents: fill(orders, (r) => r.cents ?? 0),
      newOffers: fill(offers, (r) => r.n),
      payoutEnabled: fill(payouts, (r) => r.n),
    };
  } catch (e) {
    console.error("admin: failed to load trends", e);
    return null;
  }
}

function zeroed<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

export async function loadKpis(): Promise<Kpis> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    users,
    newUsers7d,
    admins,
    suspended,
    listingGroups,
    orderGroups,
    pendingOffers,
    unreadMessages,
    sellers,
    payoutStarted,
    payoutEnabled,
    categoryRows,
    categoryGroups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { suspended: true } }),
    prisma.listing.groupBy({ by: ["status"], _count: { _all: true } }),
    // One pass over Order gives the per-status counts and the money totals;
    // GMV/fees/escrow are then just sums over the relevant statuses.
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { itemCents: true, platformFeeCents: true },
    }),
    // expireStaleOffers() sweeps lazily, so exclude anything already past its
    // expiry even if the row still says PENDING.
    prisma.offer.count({ where: { status: "PENDING", expiresAt: { gt: now } } }),
    prisma.message.count({ where: { readAt: null } }),
    // Anyone who has ever put up a listing — the population that has a reason
    // to connect payouts, and so the only honest denominator for the rate.
    prisma.user.count({
      where: { listings: { some: { status: { not: "REMOVED" } } } },
    }),
    // stripeConnectStartedAt is the intended marker, but accounts provisioned
    // before it existed only carry the Connect id — count either.
    prisma.user.count({
      where: {
        OR: [
          { stripeConnectStartedAt: { not: null } },
          { stripeConnectId: { not: null } },
        ],
      },
    }),
    prisma.user.count({ where: { stripePayoutsEnabledAt: { not: null } } }),
    prisma.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true },
    }),
    prisma.listing.groupBy({
      by: ["categoryId", "status"],
      _count: { _all: true },
    }),
  ]);

  const listingsByStatus = zeroed(LISTING_STATUSES);
  for (const g of listingGroups) listingsByStatus[g.status] = g._count._all;

  const ordersByStatus = zeroed(ORDER_STATUSES);
  let gmvCents = 0;
  let revenueCents = 0;
  let escrowCents = 0;
  let paidOrders = 0;
  for (const g of orderGroups) {
    ordersByStatus[g.status] = g._count._all;
    if (g.status === "COMPLETED") {
      gmvCents += g._sum.itemCents ?? 0;
      revenueCents += g._sum.platformFeeCents ?? 0;
    } else if (IN_FLIGHT_STATUSES.includes(g.status)) {
      escrowCents += g._sum.itemCents ?? 0;
    }
    if (CAPTURED_STATUSES.includes(g.status)) paidOrders += g._count._all;
  }

  const perCategory = new Map<string, { active: number; total: number }>();
  for (const g of categoryGroups) {
    const c = perCategory.get(g.categoryId) ?? { active: 0, total: 0 };
    c.total += g._count._all;
    if (g.status === "ACTIVE") c.active += g._count._all;
    perCategory.set(g.categoryId, c);
  }
  const categories: CategoryCount[] = categoryRows.map((c) => ({
    ...c,
    ...(perCategory.get(c.id) ?? { active: 0, total: 0 }),
  }));

  return {
    users,
    newUsers7d,
    admins,
    suspended,
    listingsByStatus,
    totalListings: Object.values(listingsByStatus).reduce((s, n) => s + n, 0),
    ordersByStatus,
    totalOrders: Object.values(ordersByStatus).reduce((s, n) => s + n, 0),
    paidOrders,
    completedOrders: ordersByStatus.COMPLETED,
    gmvCents,
    revenueCents,
    escrowCents,
    pendingOffers,
    unreadMessages,
    sellers,
    payoutStarted,
    payoutEnabled,
    categories,
  };
}
