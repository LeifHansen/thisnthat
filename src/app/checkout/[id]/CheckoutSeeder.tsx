"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart, type CartItem } from "@/lib/cart";

export function CheckoutSeeder({ item }: { item: CartItem }) {
  const { add, ready } = useCart();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    add(item);
    router.replace("/checkout");
  }, [ready, add, item, router]);

  return (
    <div className="bx-panel p-10 text-center text-muted">
      Taking you to checkout…
    </div>
  );
}
