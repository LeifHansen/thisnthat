"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { BasketIcon } from "@/components/BrandIcons";

export function CartButton({ className = "" }: { className?: string }) {
  const { count, ready } = useCart();
  return (
    <Link
      href="/cart"
      aria-label={`Cart${count ? ` (${count} item${count === 1 ? "" : "s"})` : ""}`}
      className={`relative inline-flex items-center justify-center h-11 w-11 rounded-full border-2 border-[var(--tnt-ink)] bg-white !text-ink shadow-[0_2px_0_var(--tnt-ink)] hover:-translate-y-0.5 transition-transform ${className}`}
    >
      <BasketIcon className="h-5 w-5" />
      {ready && count > 0 && <span className="tnt-cartdot">{count}</span>}
    </Link>
  );
}
