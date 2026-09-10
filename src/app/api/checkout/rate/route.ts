import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateSaleShipping } from "@/lib/shipping";
import { rateLimit } from "@/lib/rateLimit";

// Pre-payment shipping quote for the cart. The checkout UI calls this once
// the buyer's ZIP is entered so the summary shows the real (rated) shipping
// before they confirm — the authoritative amount is still computed
// server-side in /api/checkout at order creation. Guests included, so no
// auth; rating is zone-based, so destination ZIP (+state) is enough.

const quoteSchema = z.object({
  listingIds: z.array(z.string().trim().min(1).max(64)).min(1).max(20),
  state: z.string().trim().max(60).optional().default(""),
  postalCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Enter a valid ZIP."),
});

export async function POST(req: Request) {
  const limited = rateLimit(req, "checkout-rate", 30, 60_000);
  if (limited) return limited;

  const parsed = quoteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid ZIP." }, { status: 400 });
  }
  const { listingIds, state, postalCode } = parsed.data;

  const listings = await prisma.listing.findMany({
    where: { id: { in: [...new Set(listingIds)] }, status: "ACTIVE" },
    select: { id: true, sellerId: true },
  });
  const sellerZips = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...new Set(listings.map((l) => l.sellerId))] } },
        select: { id: true, shipFromPostalCode: true },
      })
    ).map((u) => [u.id, u.shipFromPostalCode]),
  );

  const quotes = await Promise.all(
    listings.map(async (l) => {
      const rate = await rateSaleShipping(sellerZips.get(l.sellerId), {
        name: "Quote",
        line1: "",
        city: "",
        state,
        postalCode,
      });
      return [l.id, rate.cents] as const;
    }),
  );

  return NextResponse.json({
    shipCentsByListing: Object.fromEntries(quotes),
    totalShipCents: quotes.reduce((s, [, c]) => s + c, 0),
  });
}
