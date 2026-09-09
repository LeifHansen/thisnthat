import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

// Aggregation helpers over stored SoldItem rows: summary stats and a monthly
// time series for the price-trends dashboard and the data-driven price guide.

export type SoldStats = {
  count: number;
  medianCents: number | null;
  avgCents: number | null;
  minCents: number | null;
  maxCents: number | null;
  lastSoldAt: Date | null;
};

export type SeriesPoint = {
  /** Bucket key, e.g. "2026-07". */
  period: string;
  /** Human label, e.g. "Jul 2026". */
  label: string;
  count: number;
  medianCents: number | null;
  avgCents: number | null;
};

type Row = { priceCents: number; soldAt: Date };

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function computeStats(rows: Row[]): SoldStats {
  const prices = rows.map((r) => r.priceCents);
  if (prices.length === 0) {
    return { count: 0, medianCents: null, avgCents: null, minCents: null, maxCents: null, lastSoldAt: null };
  }
  const sum = prices.reduce((a, b) => a + b, 0);
  const last = rows.reduce<Date | null>(
    (acc, r) => (acc == null || r.soldAt > acc ? r.soldAt : acc),
    null,
  );
  return {
    count: prices.length,
    medianCents: median(prices),
    avgCents: Math.round(sum / prices.length),
    minCents: Math.min(...prices),
    maxCents: Math.max(...prices),
    lastSoldAt: last,
  };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Monthly median/avg/count series across [from, to], zero-filling empty months
 * so the chart has a continuous x-axis.
 */
export function computeMonthlySeries(rows: Row[], from: Date, to: Date): SeriesPoint[] {
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    const k = monthKey(r.soldAt);
    const arr = buckets.get(k);
    if (arr) arr.push(r.priceCents);
    else buckets.set(k, [r.priceCents]);
  }
  const out: SeriesPoint[] = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  // Guard against a pathological range producing a runaway loop. 1200 months
  // (100 years) never truncates a real range — presets cap at 15 years and no
  // sold history predates the 1990s — while still bounding a bad from/to.
  let guard = 0;
  while (cur <= end && guard++ < 1200) {
    const k = monthKey(cur);
    const prices = buckets.get(k) ?? [];
    const sum = prices.reduce((a, b) => a + b, 0);
    out.push({
      period: k,
      label: monthLabel(cur),
      count: prices.length,
      medianCents: median(prices),
      avgCents: prices.length ? Math.round(sum / prices.length) : null,
    });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

/** Rows for a date range, optionally scoped to one beanie (by normalizedKey). */
export async function soldRows(opts: {
  key?: string;
  from: Date;
  to: Date;
  limit?: number;
}): Promise<{ priceCents: number; soldAt: Date }[]> {
  return prisma.soldItem.findMany({
    where: {
      ...(opts.key ? { normalizedKey: opts.key } : {}),
      soldAt: { gte: opts.from, lte: opts.to },
    },
    select: { priceCents: true, soldAt: true },
    orderBy: { soldAt: "asc" },
    take: opts.limit ?? 20_000,
  });
}

/** Recent individual sales (for the dashboard's sample table). */
export async function recentSales(opts: { key?: string; from: Date; to: Date; take?: number }) {
  return prisma.soldItem.findMany({
    where: {
      ...(opts.key ? { normalizedKey: opts.key } : {}),
      soldAt: { gte: opts.from, lte: opts.to },
    },
    select: {
      beanieName: true, title: true, priceCents: true, condition: true,
      buyingFormat: true, soldAt: true, link: true,
    },
    orderBy: { soldAt: "desc" },
    take: opts.take ?? 20,
  });
}

/** Beanies that have any stored sold data, with counts — powers the filter. */
export async function beaniesWithData(): Promise<
  { key: string; name: string; count: number }[]
> {
  const grouped = await prisma.soldItem.groupBy({
    by: ["normalizedKey", "beanieName"],
    _count: { _all: true },
    orderBy: { _count: { normalizedKey: "desc" } },
  });
  return grouped.map((g) => ({
    key: g.normalizedKey,
    name: g.beanieName,
    count: g._count._all,
  }));
}

export type TickerEntry = {
  name: string;
  priceCents: number;
  /** Last sale vs the previous sale: 1 up, -1 down, 0 flat/first. */
  dir: -1 | 0 | 1;
};

/**
 * Most-recently-sold beanies with their last price and last-vs-previous
 * direction — drives the stock-ticker banner. One indexed query; reduces the
 * latest rows to the last two sales per beanie in JS.
 */
export const tickerData = unstable_cache(
  tickerDataUncached,
  ["sold-ticker"],
  // Sold data only changes when an ingest runs; without this every homepage
  // view deserializes 2,500 rows to render a 40-item ticker.
  { revalidate: 300 },
);

async function tickerDataUncached(limit = 40): Promise<TickerEntry[]> {
  const rows = await prisma.soldItem.findMany({
    select: { normalizedKey: true, beanieName: true, priceCents: true, soldAt: true },
    orderBy: { soldAt: "desc" },
    take: 2500,
  });
  const byKey = new Map<
    string,
    { name: string; last: number; prev: number | null; soldAt: Date }
  >();
  for (const r of rows) {
    const e = byKey.get(r.normalizedKey);
    if (!e) {
      byKey.set(r.normalizedKey, {
        name: r.beanieName,
        last: r.priceCents,
        prev: null,
        soldAt: r.soldAt,
      });
    } else if (e.prev === null) {
      e.prev = r.priceCents; // second-most-recent sale for this beanie
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.soldAt.getTime() - a.soldAt.getTime())
    .slice(0, limit)
    .map((e) => ({
      name: e.name,
      priceCents: e.last,
      dir: e.prev === null ? 0 : e.last > e.prev ? 1 : e.last < e.prev ? -1 : 0,
    }));
}
