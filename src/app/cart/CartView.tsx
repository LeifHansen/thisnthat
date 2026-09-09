"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/lib/cart";
import { formatCents } from "@/lib/fees";
import { BasketIcon } from "@/components/BrandIcons";

export function CartView() {
  const { items, remove, ready } = useCart();

  if (!ready) {
    return <div className="tnt-panel p-10 text-center text-muted">Loading…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 text-center">
        <h1 className="text-2xl sm:text-3xl">Your cart is empty</h1>
        <p className="text-muted">
          Find something you love and add it to your cart.
        </p>
        <Link href="/browse" className="tnt-btn inline-flex">
          <BasketIcon className="h-5 w-5" />
          Browse listings
        </Link>
      </div>
    );
  }

  const subtotalCents = items.reduce((s, i) => s + i.priceCents, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl">
        Your Cart{" "}
        <span className="text-muted text-lg font-normal">
          ({items.length} item{items.length === 1 ? "" : "s"})
        </span>
      </h1>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.listingId}
            className="tnt-panel p-3 flex items-center gap-3 sm:gap-4"
          >
            <Link
              href={`/listings/${item.listingId}`}
              className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-lg border border-[var(--tnt-line)] bg-[var(--tnt-surface)]"
            >
              {item.photo ? (
                <Image
                  src={item.photo}
                  alt={item.title}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs text-muted">
                  No photo
                </span>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/listings/${item.listingId}`}
                className="font-bold leading-tight line-clamp-2 !text-ink"
              >
                {item.title}
              </Link>
              <p className="text-[var(--tnt-red)] font-extrabold mt-1">
                {formatCents(item.priceCents)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(item.listingId)}
              className="shrink-0 text-xs font-semibold text-muted hover:!text-[var(--tnt-red)] underline"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="tnt-panel p-5 space-y-3">
        <div className="flex justify-between">
          <span className="text-muted">Subtotal</span>
          <span className="font-bold">{formatCents(subtotalCents)}</span>
        </div>
        <p className="text-muted text-xs">
          Shipping is calculated at checkout. No account required — you can
          check out as a guest.
        </p>
        <Link href="/checkout" className="tnt-btn w-full">
          <BasketIcon className="h-5 w-5" />
          Proceed to Checkout
        </Link>
        <Link
          href="/browse"
          className="block text-center text-sm font-semibold !text-[var(--tnt-red)]"
        >
          ← Continue shopping
        </Link>
      </div>
    </div>
  );
}
