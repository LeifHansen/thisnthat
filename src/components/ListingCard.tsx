import Link from "next/link";
import type { Listing } from "@prisma/client";
import { formatCents } from "@/lib/fees";
import { firstRealPhoto } from "@/lib/photos";
import { AuthBadge } from "@/components/AuthBadge";
import { AddToCartButton } from "@/components/AddToCartButton";
import { PhotoCarousel } from "@/components/PhotoCarousel";

// The subset of Listing a card actually renders. Accepting a Pick (rather than
// the full Prisma model) lets the same card render from a server query OR from
// the JSON the /api/listings load-more endpoint returns.
export type ListingCardData = Pick<
  Listing,
  | "id"
  | "title"
  | "beanieName"
  | "priceCents"
  | "photos"
  | "authType"
  | "registrationNumber"
  | "grade"
  | "sellerId"
  | "status"
  | "quantity"
>;

export function ListingCard({ listing }: { listing: ListingCardData }) {
  const photo = firstRealPhoto(listing.photos);

  return (
    <div className="bx-panel p-3 h-full flex flex-col gap-2.5 transition-shadow hover:shadow-[var(--bx-shadow-lg)]">
      <Link
        href={`/listings/${listing.id}`}
        aria-label={`View ${listing.title}`}
        className="block"
      >
        <PhotoCarousel
          photos={listing.photos}
          alt={listing.title}
          compact
          sizes="(max-width:768px) 50vw, 25vw"
        />
      </Link>

      <Link href={`/listings/${listing.id}`} className="!text-ink">
        <h3 className="text-sm font-bold leading-tight line-clamp-2 hover:opacity-80">
          {listing.title}
        </h3>
      </Link>

      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-extrabold text-[var(--bx-red)] leading-none">
          {formatCents(listing.priceCents)}
        </p>
        <AuthBadge
          authType={listing.authType}
          registrationNumber={listing.registrationNumber}
          grade={listing.grade}
        />
      </div>

      <div className="mt-auto pt-0.5">
        {listing.status === "SOLD" || listing.quantity <= 0 ? (
          <p className="bx-badge bx-badge--error w-full justify-center text-center">
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
