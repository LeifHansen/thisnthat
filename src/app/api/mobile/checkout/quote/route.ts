import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeSaleFees } from "@/lib/fees";
import { getMobileUser } from "@/lib/mobileAuth";
import { rateLimit } from "@/lib/rateLimit";
import { rateSaleShipping } from "@/lib/shipping";
import { checkoutQuoteSchema, firstError } from "@/lib/validation";

// What the app must show the buyer before it asks them to pay.
//
// /api/checkout refuses to authorize an amount different from the one the
// buyer saw (`expectedTotalCents`), and it live-rates shipping from the
// seller's ZIP. The listing detail screen only knows the flat fallback rate,
// so without this the app would either have to skip that consent check or
// trip it on every rated order. Same inputs, same helpers, same numbers.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = rateLimit(req, "mobile-quote", 30, 60_000);
  if (limited) return limited;

  const user = await getMobileUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = checkoutQuoteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const { listingIds, ship } = parsed.data;

  const listings = await prisma.listing.findMany({
    where: { id: { in: [...new Set(listingIds)] }, status: "ACTIVE", quantity: { gt: 0 } },
    select: { id: true, title: true, priceCents: true, sellerId: true },
  });
  // Mirrors /api/checkout: a seller can't buy their own listing, so quoting one
  // would only produce a total that checkout then refuses.
  const buyable = listings.filter((l) => l.sellerId !== user.id);
  if (buyable.length === 0) {
    return NextResponse.json(
      {
        error:
          listings.length > 0
            ? "You can't buy your own listing."
            : "These items are no longer available.",
      },
      { status: 400 },
    );
  }

  const sellerZips = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...new Set(buyable.map((l) => l.sellerId))] } },
        select: { id: true, shipFromPostalCode: true },
      })
    ).map((u) => [u.id, u.shipFromPostalCode]),
  );

  const items = await Promise.all(
    buyable.map(async (l) => {
      const rate = await rateSaleShipping(sellerZips.get(l.sellerId), ship);
      const fees = computeSaleFees(l.priceCents, rate.cents);
      return {
        listingId: l.id,
        title: l.title,
        itemCents: fees.itemCents,
        shipToBuyerCents: fees.shipToBuyerCents,
        totalCents: fees.totalCents,
        shippingRated: rate.rated,
      };
    }),
  );

  return NextResponse.json({
    items,
    totalCents: items.reduce((sum, i) => sum + i.totalCents, 0),
  });
}
