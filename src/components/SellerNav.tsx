"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Seller Hub tab bar — keeps the selling experience in its own portal,
// separate from the buyer-facing dashboard (eBay Seller Hub style).
const TABS = [
  { href: "/sell", label: "Overview" },
  { href: "/sell/new", label: "List an item" },
  { href: "/sell/store", label: "Your store" },
  { href: "/store/my-store", label: "View storefront" },
];

export function SellerNav() {
  const pathname = usePathname();
  return (
    <div className="mb-8 border-b border-zinc-200 dark:border-zinc-800">
      <nav className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                active
                  ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
