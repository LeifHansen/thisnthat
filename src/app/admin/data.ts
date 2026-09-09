import { prisma } from "@/lib/db";
import { reconcileStuckAuthRequests } from "@/lib/authPayment";

// Order statuses where money has been captured into escrow (or beyond) — used
// for GMV and platform-fee revenue so pending/cancelled carts don't inflate it.
const CAPTURED = [
  "PAID_ESCROW",
  "AWAITING_SHIP_TO_BUYER",
  "SHIPPED_TO_BUYER",
  "COMPLETED",
] as const;

// Authentication submissions whose payment was collected — anything past the
// unpaid REQUESTED state, terminal or not (a FAILED authentication was still
// a paid service).
const AUTH_PAID = [
  "PAID",
  "AWAITING_INBOUND",
  "AT_CENTER",
  "IN_REVIEW",
  "PASSED",
  "FAILED",
  "RETURNED",
] as const;

const QUEUE_ACTIONABLE = ["AWAITING_INBOUND", "AT_CENTER", "IN_REVIEW"] as const;

/** Work awaiting an admin, split by the queue it belongs to. */
export type QueueCounts = {
  /** Paid authentication submissions in an actionable state. */
  auth: number;
  /** New-beanie submissions awaiting a catalogue decision. */
  database: number;
  /** Both queues together — what the Queue nav badge shows. */
  total: number;
};

/**
 * The two admin queues share the /admin/queue page but are separate piles of
 * work, so they're counted separately — the overview gives each its own tile.
 */
export async function loadQueueCounts(): Promise<QueueCounts> {
  try {
    const [auth, database] = await Promise.all([
      prisma.authenticationRequest.count({
        where: { status: { in: [...QUEUE_ACTIONABLE] } },
      }),
      prisma.beanieSubmission.count({ where: { status: "PENDING" } }),
    ]);
    return { auth, database, total: auth + database };
  } catch {
    return { auth: 0, database: 0, total: 0 };
  }
}

/** Total work items awaiting an admin: auth requests + new-beanie submissions. */
export async function loadQueueCount(): Promise<number> {
  return (await loadQueueCounts()).total;
}

export type Kpis = {
  users: number;
  admins: number;
  suspended: number;
  activeListings: number;
  totalListings: number;
  totalOrders: number;
  paidOrders: number;
  completedOrders: number;
  gmvCents: number;
  revenueCents: number;
  authPending: number;
  /** Paid authentication submissions (all-time) and their service-fee take. */
  authPaidCount: number;
  authRevenueCents: number;
  registry: number;
  /** All-time clicks on the tracked True Blue egress link (/out/true-blue). */
  trueBlueClicks: number;
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
};

export type Trends = {
  /** ISO dates (UTC Mondays), oldest → newest. All series align to these. */
  weeks: string[];
  newUsers: number[];
  newListings: number[];
  paidOrders: number[];
  gmvCents: number[];
  authPaid: number[];
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

    const [users, listings, orders, auth, payouts] = await Promise.all([
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
        FROM "AuthenticationRequest"
        WHERE "createdAt" >= ${start} AND status::text <> 'REQUESTED'
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
      authPaid: fill(auth, (r) => r.n),
      payoutEnabled: fill(payouts, (r) => r.n),
    };
  } catch (e) {
    console.error("admin: failed to load trends", e);
    return null;
  }
}

export async function loadKpis(): Promise<Kpis> {
  // A paid authentication whose webhook was missed sits at REQUESTED and
  // would be invisible in every figure below. The queue page reconciles on
  // open, but the report snapshot is often the only page an operator checks —
  // reconcile here too (best-effort, cheap when nothing is stuck).
  await reconcileStuckAuthRequests();

  const [
    users,
    admins,
    suspended,
    activeListings,
    totalListings,
    totalOrders,
    paidOrders,
    completedOrders,
    money,
    authPending,
    authMoney,
    registry,
    trueBlueClicks,
    sellers,
    payoutStarted,
    payoutEnabled,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { suspended: true } }),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.listing.count(),
    prisma.order.count(),
    prisma.order.count({ where: { status: { in: [...CAPTURED] } } }),
    prisma.order.count({ where: { status: "COMPLETED" } }),
    prisma.order.aggregate({
      where: { status: { in: [...CAPTURED] } },
      _sum: { itemCents: true, platformFeeCents: true },
    }),
    prisma.authenticationRequest.count({
      where: { status: { in: [...QUEUE_ACTIONABLE] } },
    }),
    // Authentication is a revenue line of its own — these sales never touch
    // the Order table, so without this the report reads $0 after an auth sale.
    prisma.authenticationRequest.aggregate({
      where: { status: { in: [...AUTH_PAID] } },
      _sum: { serviceFeeCents: true },
      _count: true,
    }),
    prisma.registryEntry.count(),
    prisma.outboundClick.count({ where: { target: "true-blue" } }),
    // Anyone who has ever put up a listing — the population that has a reason
    // to connect payouts, and so the only honest denominator for the rate.
    prisma.user.count({
      where: { listings: { some: { status: { not: "REMOVED" } } } },
    }),
    prisma.user.count({ where: { stripeConnectId: { not: null } } }),
    prisma.user.count({ where: { stripePayoutsEnabledAt: { not: null } } }),
  ]);

  return {
    users,
    admins,
    suspended,
    activeListings,
    totalListings,
    totalOrders,
    paidOrders,
    completedOrders,
    gmvCents: money._sum.itemCents ?? 0,
    revenueCents: money._sum.platformFeeCents ?? 0,
    authPending,
    authPaidCount: authMoney._count,
    authRevenueCents: authMoney._sum.serviceFeeCents ?? 0,
    registry,
    trueBlueClicks,
    sellers,
    payoutStarted,
    payoutEnabled,
  };
}
