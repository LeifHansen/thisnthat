import Link from "next/link";
import { formatCents } from "@/lib/fees";
import { firstRealPhoto } from "@/lib/photos";
import type { LotCardData } from "@/lib/listings";
import { ConditionBadge } from "@/components/ConditionBadge";
import { AddToCartButton } from "@/components/AddToCartButton";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { SellerRating } from "@/components/SellerRating";

/**
 * Storefront card for a lot — a single listing bundling several items sold
 * together for one price. Mirrors ListingCard but leads with a "LOT · N items"
 * ribbon so buyers can tell a bundle apart from a single item at a glance.
 */
export function LotCard({ lot }: { lot: LotCardData }) {
  const photo = firstRealPhoto(lot.photos);
  const soldOut = lot.status === "SOLD" || lot.quantity <= 0;
  const href = `/listings/${lot.id}`;

  return (
    <div className="tnt-panel p-3 h-full flex flex-col gap-2.5 transition-shadow hover:shadow-[var(--tnt-shadow-lg)]">
      <div className="relative">
        <Link href={href} aria-label={`View ${lot.title}`} className="block">
          <PhotoCarousel
            photos={lot.photos}
            alt={lot.title}
            compact
            sizes="(max-width:768px) 50vw, 25vw"
          />
        </Link>
        <span className="absolute top-2 left-2 z-10 rounded-full bg-[var(--tnt-purple)] text-white text-[11px] font-bold px-2 py-0.5 shadow-[var(--tnt-shadow-sm)]">
          Lot · {lot.pieces} {lot.pieces === 1 ? "item" : "items"}
        </span>
      </div>

      <Link href={href} className="!text-ink">
        <h3 className="text-sm font-bold leading-tight line-clamp-2 hover:opacity-80">
          {lot.title}
        </h3>
      </Link>

      {lot.sellerRating !== undefined && (
        <SellerRating rating={lot.sellerRating} className="-mt-1" />
      )}

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted font-semibold">
            Whole lot
          </p>
          <p className="text-lg font-extrabold text-[var(--tnt-red)] leading-none">
            {formatCents(lot.priceCents)}
          </p>
        </div>
        <ConditionBadge condition={lot.condition} />
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
              listingId: lot.id,
              title: lot.title,
              priceCents: lot.priceCents,
              photo,
              sellerId: lot.sellerId,
            }}
          />
        )}
      </div>
    </div>
  );
}
