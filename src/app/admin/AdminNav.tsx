"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; badge?: number };

export function AdminNav({
  isSuperadmin,
  ordersCount = 0,
}: {
  isSuperadmin: boolean;
  /** Orders needing attention — shown as a badge on the Orders tab. */
  ordersCount?: number;
}) {
  const pathname = usePathname();
  // The superadmin's Overview lives in their dashboard Admin tab; HQ admins use
  // the standalone /admin overview.
  const overviewHref = isSuperadmin ? "/dashboard?tab=admin" : "/admin";
  const tabs: Tab[] = [
    { href: overviewHref, label: "Overview" },
    { href: "/admin/listings", label: "Listings" },
    { href: "/admin/orders", label: "Orders", badge: ordersCount },
    // Only the superadmin can manage accounts (roles, suspension, deletion).
    ...(isSuperadmin ? [{ href: "/admin/users", label: "Users" } as Tab] : []),
    { href: "/admin/blog", label: "Blog" },
  ];

  return (
    <nav className="flex flex-wrap gap-1.5 rounded-xl bg-[var(--tnt-surface)] border border-[var(--tnt-line)] p-1.5">
      {tabs.map((t) => {
        const active =
          t.href === overviewHref
            ? pathname === "/admin" || pathname === "/dashboard"
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? "bg-[var(--tnt-dark)] !text-white"
                : "!text-ink hover:bg-black/5"
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className="ml-1.5 rounded-full bg-[var(--tnt-red)] text-white text-[10px] font-bold px-1.5 py-0.5">
                {t.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
