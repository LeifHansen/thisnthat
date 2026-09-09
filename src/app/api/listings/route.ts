import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { getBeanieGroupsPage, sweepAbandonedReservations } from "@/lib/listings";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

// Paginated beanie options for the homepage "shop" grid. Listings are grouped
// by beanie (price range + option count), real-photo beanies first.
export async function GET(req: Request) {
  // Generous for real infinite scrolling, but stops a tight loop from
  // hammering the grouping endpoint.
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

  const { items, total } = await getBeanieGroupsPage({
    skip: offset,
    take: PAGE_SIZE,
  });
  const nextOffset = offset + items.length < total ? offset + PAGE_SIZE : null;

  return NextResponse.json({ items, nextOffset });
}
