import Link from "next/link";
import Image from "next/image";
import { formatPrice, type Listing } from "@/lib/types";

export function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="relative aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        <Image
          src={listing.images[0]}
          alt={listing.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {listing.allow_offers && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
            Offers OK
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-1 text-sm font-medium">{listing.title}</h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{listing.store.name}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-semibold">{formatPrice(listing.price_cents, listing.currency)}</span>
          {listing.condition && (
            <span className="text-xs text-zinc-500">{listing.condition}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
