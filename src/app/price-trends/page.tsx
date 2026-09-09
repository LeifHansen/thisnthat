import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { SoldTicker } from "@/components/SoldTicker";
import {
  PriceTrendsDashboard,
  type TrendsPayload,
} from "@/components/PriceTrendsDashboard";
import {
  soldRows,
  recentSales,
  beaniesWithData,
  computeStats,
  computeMonthlySeries,
} from "@/lib/sold-stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Beanie Baby Price Trends — Real eBay Sold Values",
  description:
    "Track Beanie Baby prices with real recent eBay sold data. See median and average sold values over time, filter by beanie and date range, and browse recent completed sales.",
  alternates: { canonical: "/price-trends" },
  keywords: [
    "Beanie Baby prices",
    "Beanie Baby value",
    "Beanie Baby sold prices",
    "Beanie Baby price guide",
    "eBay Beanie Baby sold",
    "Beanie Baby price trends",
  ],
};

// The all-beanies overview only changes when a sold-data ingest runs, but it
// reads up to 20k rows and a full-table groupBy — far too heavy to redo per
// anonymous page view. Cache the COMPUTED payload (plain JSON) hourly, keyed
// by the rolling month window.
const loadOverview = unstable_cache(
  async (fromIso: string, toIso: string) => {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const [rows, recent, list] = await Promise.all([
      soldRows({ from, to }),
      recentSales({ from, to, take: 20 }),
      beaniesWithData(),
    ]);
    return {
      stats: computeStats(rows),
      series: computeMonthlySeries(rows, from, to),
      recent: recent.map((r) => ({ ...r, soldAt: r.soldAt.toISOString() })),
      beanies: list,
    };
  },
  ["price-trends-overview"],
  { revalidate: 3600 },
);

export default async function PriceTrendsPage() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));

  let initial: TrendsPayload = {
    key: null,
    from: from.toISOString(),
    to: now.toISOString(),
    stats: { count: 0, medianCents: null, avgCents: null, minCents: null, maxCents: null, lastSoldAt: null },
    series: [],
    recent: [],
  };
  let beanies: { key: string; name: string; count: number }[] = [];

  try {
    // Stable hour-bucketed bounds so the cache key doesn't change per request.
    const toIso = new Date(
      Math.floor(now.getTime() / 3_600_000) * 3_600_000,
    ).toISOString();
    const overview = await loadOverview(from.toISOString(), toIso);
    initial = {
      key: null,
      from: from.toISOString(),
      to: toIso,
      stats: overview.stats,
      series: overview.series,
      recent: overview.recent,
    };
    beanies = overview.beanies;
  } catch {
    // DB unavailable → render the empty state below.
  }

  const hasData = beanies.length > 0 || initial.stats.count > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <Suspense fallback={null}>
        <SoldTicker />
      </Suspense>

      <header className="space-y-3">
        <p className="bx-badge">Market Data</p>
        <h1 className="text-4xl sm:text-5xl">
          Beanie Baby <span className="text-[var(--bx-red)]">Price Trends</span>
        </h1>
        <p className="text-muted max-w-2xl">
          Real recent eBay sold prices — not guesses. See how values move over
          time, filter by beanie and date range, and check the median before you
          buy, sell, or list. Data is aggregated from completed eBay sales.
        </p>
      </header>

      {hasData ? (
        <PriceTrendsDashboard initial={initial} beanies={beanies} />
      ) : (
        <div className="bx-panel bx-panel--accent p-8 text-center space-y-3">
          <h2 className="text-xl font-bold">No sold data yet</h2>
          <p className="text-muted text-sm max-w-xl mx-auto">
            Price trends appear here once eBay sold data has been ingested. A
            superadmin can pull data per beanie from the{" "}
            <Link href="/database" className="!text-[var(--bx-red)] font-semibold">
              database
            </Link>{" "}
            (or run the batch importer), and it accumulates over time into the
            trends above.
          </p>
        </div>
      )}

      <section className="bx-panel bx-panel--accent p-6 text-center space-y-2">
        <h2 className="text-xl font-bold">Have one of these to sell?</h2>
        <p className="text-muted text-sm max-w-xl mx-auto">
          List it on Beanie Xchange — escrow-protected, with a sealed COA and a
          permanent BX Registry number on every authenticated sale.
        </p>
        <div className="flex flex-wrap gap-3 justify-center pt-1">
          <Link href="/sell" className="bx-btn">
            Sell a Beanie
          </Link>
          <Link href="/database" className="bx-btn bx-btn--ghost">
            Browse the Database
          </Link>
        </div>
      </section>
    </div>
  );
}
