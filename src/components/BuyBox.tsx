"use client";

import { useRouter } from "next/navigation";
import { useCart, type CartItem } from "@/lib/cart";
import { AddToCartButton } from "@/components/AddToCartButton";
import { BasketIcon } from "@/components/BrandIcons";
import { formatCents } from "@/lib/fees";

/**
 * Purchase controls on the listing page. "Buy Now" drops the item in the cart
 * and jumps straight to checkout; the secondary action adds to cart and keeps
 * the shopper browsing — gently steering toward a multi-item basket.
 */
export function BuyBox({
  item,
  totalCents,
}: {
  item: CartItem;
  totalCents: number;
}) {
  const { add } = useCart();
  const router = useRouter();

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          add(item);
          router.push("/checkout");
        }}
        className="bx-btn w-full"
      >
        <BasketIcon className="h-5 w-5" />
        Buy Now — {formatCents(totalCents)}
      </button>
      <AddToCartButton item={item} variant="full" />
    </div>
  );
}
