import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeSaleFees, PLATFORM_FEE_LABEL } from "@/lib/fees";
import { displayNameOf } from "@/lib/users";
import { readAttributes } from "@/lib/categories";
import { conditionLabel } from "@/lib/listingOptions";
import { getSimilarListings } from "@/lib/listings";

export const dynamic = "force-dynamic";

// JSON listing detail for the native app (and any non-HTML client). The web
// detail page (src/app/listings/[id]/page.tsx) stays server-rendered for SEO;
// this endpoint exposes the same core data as plain JSON so the iOS app can
// render a native detail screen instead of opening the web page in a browser.
//
// Public, read-only: no auth. Viewer-specific state (my like, my pending offer,
// buy/checkout) is intentionally omitted — that arrives with token auth (see
// mobile/README.md roadmap). DRAFT/REMOVED listings 404 like the web page.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const listing = await prisma.listing
    .findUnique({
      where: { id },
      include: {
        seller: {
          select: { id: true, name: true, displayName: true, avatarUrl: true },
        },
        category: { select: { slug: true, name: true } },
        lotItems: { orderBy: { position: "asc" } },
      },
    })
    .catch(() => null);

  if (!listing || listing.status === "DRAFT" || listing.status === "REMOVED") {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const sold = listing.status === "SOLD" || listing.quantity <= 0;
  const fees = computeSaleFees(listing.priceCents);

  // Seller rating (aggregated over every review of this seller) and other
  // for-sale listings in the same category, so the app can show the same
  // trust line and "similar" rail as the web page. Both best-effort.
  const [reviewAgg, similar] = await Promise.all([
    prisma.productReview
      .aggregate({
        where: { sellerId: listing.sellerId },
        _avg: { rating: true },
        _count: true,
      })
      .catch(() => null),
    getSimilarListings(listing.categoryId, listing.id, 8).catch(() => []),
  ]);
  const ratingCount = reviewAgg?._count ?? 0;
  const ratingAvg =
    ratingCount > 0 && reviewAgg?._avg.rating
      ? Math.round(reviewAgg._avg.rating * 10) / 10
      : null;

  return NextResponse.json({
    id: listing.id,
    title: listing.title,
    brand: listing.brand,
    itemName: listing.itemName,
    category: { slug: listing.category.slug, name: listing.category.name },
    attributes: readAttributes(listing.attributes),
    condition: listing.condition,
    conditionLabel: conditionLabel(listing.condition),
    description: listing.description,
    priceCents: listing.priceCents,
    photos: listing.photos,
    quantity: listing.quantity,
    status: listing.status,
    sold,
    isLot: listing.isLot,
    lotItems: listing.lotItems.map((it) => ({
      name: it.name,
      quantity: it.quantity,
    })),
    lotPieces: listing.isLot
      ? listing.lotItems.reduce((n, it) => n + it.quantity, 0)
      : 0,
    fees: {
      itemCents: fees.itemCents,
      // Platform fee is deducted from the seller's proceeds, not added to the
      // buyer's total. `totalCents` is what the buyer pays (item + shipping);
      // `sellerProceedsCents` is what the seller nets (item − fee).
      platformFeeCents: fees.platformFeeCents,
      platformFeeLabel: PLATFORM_FEE_LABEL,
      shipToBuyerCents: fees.shipToBuyerCents,
      totalCents: fees.totalCents,
      sellerProceedsCents: fees.sellerProceedsCents,
    },
    seller: {
      id: listing.seller.id,
      name: displayNameOf(listing.seller),
      avatarUrl: listing.seller.avatarUrl,
      rating: { avg: ratingAvg, count: ratingCount },
    },
    similar,
    webUrl: `/listings/${listing.id}`,
  });
}
