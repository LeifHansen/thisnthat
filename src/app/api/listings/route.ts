import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { getListingsPage, sweepAbandonedReservations } from "@/lib/listings";
import { buildBrowseWhere, parseBrowseParams } from "@/app/browse/filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

// Paginated listing cards for the homepage "shop" grid and the mobile app.
//
// Query params:
//   offset      0-based row offset (default 0); the response's `nextOffset`
//               feeds the next call, null when the end is reached.
//   q           full-text search over title / brand / item name / description
//   category    category slug (src/lib/categories.ts)
//   condition   NEW | LIKE_NEW | GOOD | FAIR | FOR_PARTS
//   minPrice    lower price bound in dollars (`min` also accepted)
//   maxPrice    upper price bound in dollars (`max` also accepted)
//   sort        newest (default) | price_asc | price_desc
//   type=lots   page lot listings instead of single items
//   attr.<key>  per-category facet (only when `category` is set)
//
// Every param is whitelisted by parseBrowseParams — anything unknown is
// ignored rather than turned into a Prisma error. Responds
// `{ items: ListingCardData[], nextOffset: number | null }`.
export async function GET(req: Request) {
  // Generous for real infinite scrolling, but stops a tight loop from
  // hammering the endpoint.
  const limited = rateLimit(req, "listings", 120, 60_000);
  if (limited) return limited;

  // The storefront's reconciliation tick, same as / and /browse call. It
  // matters more here than the endpoint's name suggests: while Cloudflare is
  // blocking Stripe's webhook (see the root README), these page-load sweeps
  // are the only thing advancing paid orders and releasing dead reservations.
  // Every other caller is a web page, so without this a buyer who only ever
  // uses the app would authorize payment and never trigger the reconciliation
  // that moves their own order along. Self-throttled to once per 5 minutes and
  // deliberately not awaited.
  sweepAbandonedReservations();

  const url = new URL(req.url);
  const offset = Math.max(
    0,
    Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
  );

  const filters = parseBrowseParams(Object.fromEntries(url.searchParams));
  const where = await buildBrowseWhere(filters);
  // getListingsPage defaults to single items; the where's isLot wins.
  if (filters.lots) where.isLot = true;

  const { items, total } = await getListingsPage({
    where,
    skip: offset,
    take: PAGE_SIZE,
    sort: filters.sort,
  });
  const nextOffset = offset + items.length < total ? offset + PAGE_SIZE : null;

  return NextResponse.json({ items, nextOffset });
}
