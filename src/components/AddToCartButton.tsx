"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart, type CartItem } from "@/lib/cart";
import { toast } from "@/lib/toast";

/**
 * Add-to-cart control. Two visual variants:
 *   - "card"  → compact pill used on listing cards
 *   - "full"  → full-width primary button used on the listing detail page
 * Once an item is in the cart it flips to a quiet "In cart · View" state so
 * we gently steer the shopper toward the cart without nagging.
 */
export function AddToCartButton({
  item,
  variant = "card",
}: {
  item: CartItem;
  variant?: "card" | "full";
}) {
  const { add, has } = useCart();
  const inCart = has(item.listingId);
  const [justAdded, setJustAdded] = useState(false);

  if (inCart) {
    return (
      <Link
        href="/cart"
        className={
          variant === "full"
            ? "tnt-btn tnt-btn--green w-full"
            : "flex w-full items-center justify-center gap-1 whitespace-nowrap py-1.5 text-xs font-bold !text-[var(--tnt-green)]"
        }
      >
        {justAdded ? "Added ✓ " : ""}In cart · View →
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        add(item);
        setJustAdded(true);
        toast.success(`${item.title} added to cart`);
      }}
      className={
        variant === "full"
          ? "tnt-btn tnt-btn--ghost w-full"
          : "flex w-full items-center justify-center whitespace-nowrap rounded-full border-2 border-[var(--tnt-ink)] bg-[var(--tnt-yellow)] !text-ink px-3 py-1.5 text-xs font-bold shadow-[0_2px_0_var(--tnt-ink)] hover:-translate-y-0.5 transition-transform"
      }
    >
      + Add to Cart
    </button>
  );
}
