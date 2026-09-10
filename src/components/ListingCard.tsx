import Link from "next/link";
import type { Listing } from "@prisma/client";
import { formatCents } from "@/lib/fees";
import { firstRealPhoto } from "@/lib/photos";
import { ConditionBadge } from "@/components/ConditionBadge";
import { AddToCartButton } from "@/components/AddToCartButton";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { SellerRating, type SellerRatingData } from "@/components/SellerRating";

// The subset of Listing a card actually renders. Accepting a Pick (rather than
// the full Prisma model) lets the same card render from a server query
// (CARD_SELECT in src/lib/listings.ts selects exactly this) OR from the JSON
// the /api/listings load-more endpoint returns.
export type ListingCardData = Pick<
  Listing,
  | "id"
  | "title"
  | "priceCents"
  | "photos"
  | "condition"
  | "sellerId"
  | "status"
  | "quantity"
  | "isLot"
  | "categoryId"
> & {
  // The seller's verified-buyer rating, attached by withSellerRatings() in
  // src/lib/listings.ts. Optional so a card can still render from a bare
  // Listing row (e.g. the dashboard's liked list) — it then omits the line.
  sellerRating?: SellerRatingData | null;
};

export function ListingCard({ listing }: { listing: ListingCardData }) {
  const photo = firstRealPhoto(listing.photos);
  const soldOut = listing.status === "SOLD" || listing.quantity <= 0;
  const href = `/listings/${listing.id}`;

  return (
    <div className="tnt-panel p-3 h-full flex flex-col gap-2.5 transition-shadow hover:shadow-[var(--tnt-shadow-lg)]">
      <div className="relative">
        <Link href={href} aria-label={`View ${listing.title}`} className="block">
          <PhotoCarousel
            photos={listing.photos}
            alt={listing.title}
            compact
            sizes="(max-width:768px) 50vw, 25vw"
          />
        </Link>
        {/* A lot rendered through the plain card (e.g. "More from this
            seller") still needs to read as a bundle; LotCard adds the count. */}
        {listing.isLot && (
          <span className="absolute top-2 left-2 z-10 rounded-full bg-[var(--tnt-purple)] text-white text-[11px] font-bold px-2 py-0.5 shadow-[var(--tnt-shadow-sm)]">
            Lot
          </span>
        )}
      </div>

      <Link href={href} className="!text-ink">
        <h3 className="text-sm font-bold leading-tight line-clamp-2 hover:opacity-80">
          {listing.title}
        </h3>
      </Link>

      {listing.sellerRating !== undefined && (
        <SellerRating rating={listing.sellerRating} className="-mt-1" />
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-extrabold text-[var(--tnt-red)] leading-none">
          {formatCents(listing.priceCents)}
        </p>
        <ConditionBadge condition={listing.condition} />
      </div>

      <div className="mt-auto pt-0.5">
        {soldOut ? (
          <p className="tnt-badge tnt-badge--error w-full justify-center text-center">
            Sold Out
          </p>
        ) : (
          <AddToCartButton
            variant="card"
            item={{
              listingId: listing.id,
              title: listing.title,
              priceCents: listing.priceCents,
              photo,
              sellerId: listing.sellerId,
            }}
          />
        )}
      </div>
    </div>
  );
}
