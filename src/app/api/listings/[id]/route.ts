import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeSaleFees, PLATFORM_FEE_LABEL } from "@/lib/fees";
import { displayNameOf } from "@/lib/users";
import { getOtherOptions } from "@/lib/listings";

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
        lotItems: { orderBy: { position: "asc" } },
      },
    })
    .catch(() => null);

  if (!listing || listing.status === "DRAFT" || listing.status === "REMOVED") {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const sold = listing.status === "SOLD" || listing.quantity <= 0;
  const fees = computeSaleFees(listing.priceCents);

  // Other active listings of the same beanie, so the app can offer the same
  // "compare options" rail the web detail page shows. A lot is a unique bundle
  // with no same-beanie peers, so it skips this. Best-effort.
  const otherOptions =
    sold || listing.isLot
      ? []
      : await getOtherOptions(listing.beanieName, listing.id, 12).catch(
          () => [],
        );

  return NextResponse.json({
    id: listing.id,
    title: listing.title,
    beanieName: listing.beanieName,
    year: listing.year,
    condition: listing.condition,
    description: listing.description,
    priceCents: listing.priceCents,
    photos: listing.photos,
    authType: listing.authType,
    grade: listing.grade,
    registrationNumber: listing.registrationNumber,
    trueBlueCertId: listing.trueBlueCertId,
    bxCertId: listing.bxCertId,
    quantity: listing.quantity,
    status: listing.status,
    sold,
    isLot: listing.isLot,
    lotItems: listing.lotItems.map((it) => ({
      beanieName: it.beanieName,
      year: it.year,
      quantity: it.quantity,
    })),
    lotPieces: listing.isLot
      ? listing.lotItems.reduce((n, it) => n + it.quantity, 0)
      : 0,
    unauthenticated: listing.authType === "UNAUTHENTICATED",
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
    },
    otherOptions: otherOptions.map((o) => ({
      id: o.id,
      title: o.title,
      beanieName: o.beanieName,
      priceCents: o.priceCents,
      photos: o.photos,
      authType: o.authType,
      condition: o.condition,
    })),
    webUrl: `/listings/${listing.id}`,
  });
}
