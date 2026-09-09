import Link from "next/link";
import { formatCents } from "@/lib/fees";
import { firstRealPhoto } from "@/lib/photos";
import type { BeanieOption } from "@/lib/listings";
import { AuthBadge } from "@/components/AuthBadge";
import { AddToCartButton } from "@/components/AddToCartButton";
import { PhotoCarousel } from "@/components/PhotoCarousel";

/**
 * Storefront card for a beanie with one or more seller listings ("options").
 * Shows the price range + option count and a swipeable photo carousel; Add to
 * Cart grabs the cheapest option, Shop Options opens the listing.
 */
export function BeanieOptionCard({ option }: { option: BeanieOption }) {
  const { cheapest, optionCount, minCents, maxCents } = option;
  const hasRange = optionCount > 1 && maxCents > minCents;
  const href = `/listings/${cheapest.id}`;
  // Cart thumbnail comes from the cheapest listing (the one Add-to-Cart adds),
  // matching the carousel — not the group's representative photo.
  const cartPhoto = firstRealPhoto(cheapest.photos);

  return (
    <div className="bx-panel p-3 h-full flex flex-col gap-2.5 transition-shadow hover:shadow-[var(--bx-shadow-lg)]">
      <div className="relative">
        <Link
          href={href}
          aria-label={`View ${option.beanieName}`}
          className="block"
        >
          <PhotoCarousel
            photos={cheapest.photos}
            alt={option.beanieName}
            compact
            sizes="(max-width:768px) 50vw, 25vw"
          />
        </Link>
        {optionCount > 1 && (
          <span className="absolute top-2 left-2 z-10 rounded-full bg-[var(--bx-ink)] text-white text-[11px] font-bold px-2 py-0.5 shadow-[var(--bx-shadow-sm)]">
            {optionCount} options
          </span>
        )}
      </div>

      <Link href={href} className="!text-ink">
        <h3 className="text-sm font-bold leading-tight line-clamp-2 hover:opacity-80">
          {option.beanieName}
          {option.year ? (
            <span className="text-muted font-semibold"> · {option.year}</span>
          ) : null}
        </h3>
      </Link>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted font-semibold">
            {hasRange ? "From" : "Price"}
          </p>
          <p className="text-lg font-extrabold text-[var(--bx-red)] leading-none">
            {formatCents(minCents)}
          </p>
          {hasRange && (
            <p className="text-[11px] text-muted mt-0.5">
              up to {formatCents(maxCents)}
            </p>
          )}
        </div>
        <AuthBadge
          authType={cheapest.authType}
          registrationNumber={cheapest.registrationNumber}
          grade={cheapest.grade}
        />
      </div>

      <div className="mt-auto pt-0.5 space-y-1.5">
        <AddToCartButton
          variant="card"
          item={{
            listingId: cheapest.id,
            title: cheapest.title,
            priceCents: cheapest.priceCents,
            photo: cartPhoto,
            sellerId: cheapest.sellerId,
          }}
        />
        <Link
          href={href}
          className="block text-center text-xs font-semibold !text-[var(--bx-red)]"
        >
          Shop options →
        </Link>
      </div>
    </div>
  );
}
