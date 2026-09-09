import Link from "next/link";
import Image from "next/image";
import { formatCents } from "@/lib/fees";
import { firstRealPhoto, PLACEHOLDER_PHOTO } from "@/lib/photos";
import { listingImageAlt } from "@/lib/image-seo";
import type { ListingOption } from "@/lib/listings";
import { AuthBadge } from "@/components/AuthBadge";
import { AddToCartButton } from "@/components/AddToCartButton";

/**
 * Horizontal carousel of the other sellers' listings for the same beanie, so a
 * buyer can compare price / condition / authentication and pick an option.
 */
export function OtherOptions({ options }: { options: ListingOption[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
      {options.map((o) => {
        const photo = firstRealPhoto(o.photos);
        return (
          <div
            key={o.id}
            className="snap-start shrink-0 w-40 sm:w-44 bx-panel p-2.5 flex flex-col gap-2"
          >
            <Link href={`/listings/${o.id}`} className="block !text-ink space-y-2">
              <div className="relative aspect-square rounded-lg overflow-hidden border border-[var(--bx-line)] bg-[var(--bx-surface)]">
                {photo ? (
                  <Image
                    src={photo}
                    alt={listingImageAlt(o.title)}
                    fill
                    sizes="180px"
                    className="object-cover"
                  />
                ) : (
                  <Image
                    src={PLACEHOLDER_PHOTO}
                    alt={`${listingImageAlt(o.title)} — photo coming soon`}
                    fill
                    sizes="180px"
                    className="object-cover"
                  />
                )}
              </div>
              <p className="text-base font-extrabold text-[var(--bx-red)] leading-none">
                {formatCents(o.priceCents)}
              </p>
              <p className="text-[11px] text-muted line-clamp-1">{o.condition}</p>
            </Link>
            <div className="flex">
              <AuthBadge
                authType={o.authType}
                registrationNumber={o.registrationNumber}
                grade={o.grade}
              />
            </div>
            <div className="mt-auto">
              <AddToCartButton
                variant="card"
                item={{
                  listingId: o.id,
                  title: o.title,
                  priceCents: o.priceCents,
                  photo,
                  sellerId: o.sellerId,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
