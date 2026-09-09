import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import {
  soldRows,
  recentSales,
  computeStats,
  computeMonthlySeries,
} from "@/lib/sold-stats";

// Public read API for the price-trends dashboard: aggregated stats + a monthly
// median/volume series + a recent-sales sample, for an optional single beanie
// and a date range (defaults to the last 12 months). Aggregate data only.

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

export async function GET(req: Request) {
  const limited = rateLimit(req, "sold-trends", 120, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const key = url.searchParams.get("key")?.trim() || undefined;
  const now = new Date();
  const to = parseDate(url.searchParams.get("to")) ?? now;
  let from =
    parseDate(url.searchParams.get("from")) ??
    new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  if (from > to) from = new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), 1));

  try {
    const [rows, recent] = await Promise.all([
      soldRows({ key, from, to }),
      recentSales({ key, from, to, take: 20 }),
    ]);
    return NextResponse.json({
      ok: true,
      key: key ?? null,
      from: from.toISOString(),
      to: to.toISOString(),
      stats: computeStats(rows),
      series: computeMonthlySeries(rows, from, to),
      recent,
    });
  } catch {
    return NextResponse.json({ error: "Could not load price trends." }, { status: 500 });
  }
}
