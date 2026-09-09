"use client";

import { useState } from "react";
import Link from "next/link";

const NAV: { href: string; label: string }[] = [
  { href: "/browse", label: "Marketplace" },
  { href: "/database", label: "Database" },
  { href: "/price-trends", label: "Price Trends" },
  { href: "/beanie-info", label: "Beanie Info" },
  { href: "/authenticate", label: "Auth & Grade" },
  { href: "/forum", label: "Community" },
  { href: "/blog", label: "Blog" },
  { href: "/rarity-guide", label: "Collecting / Rarity Guide" },
  { href: "/authentication-process", label: "How Authentication Works" },
  // Verify-cert / BX Registry — disabled with in-house authentication:
  // { href: "/registry", label: "BX Registry" },
];

export function MobileMenu({
  loggedIn,
  isAdmin,
  adminHref = "/admin",
  signOutSlot,
}: {
  loggedIn: boolean;
  isAdmin: boolean;
  adminHref?: string;
  signOutSlot?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    // No ml-auto here: the cart (or admin pill) ahead of us carries it, so
    // the whole icon cluster hugs the right edge — a second auto margin
    // would split the free space and strand the cart mid-header.
    <div className="xl:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="-mr-1 p-2.5 text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          {open ? (
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 7h16M4 12h16M4 17h16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="fixed inset-0 top-[4.4rem] z-40 bg-black/30"
          />
          <div className="fixed inset-x-0 top-[4.4rem] z-50 max-h-[calc(100vh-4.4rem)] overflow-y-auto border-b border-[var(--tnt-line)] bg-white shadow-[var(--tnt-shadow-lg)]">
            <nav className="mx-auto max-w-6xl px-4 py-3 flex flex-col">
              {NAV.map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={close}
                  className="py-3 border-t border-[var(--tnt-line)] font-medium !text-ink"
                >
                  {item.label}
                </Link>
              ))}

              {loggedIn ? (
                <>
                  <Link
                    href="/dashboard"
                    onClick={close}
                    className="py-3 border-t border-[var(--tnt-line)] font-medium !text-ink"
                  >
                    Dashboard
                  </Link>
                  {isAdmin && (
                    <Link
                      href={adminHref}
                      onClick={close}
                      className="py-3 border-t border-[var(--tnt-line)] font-bold !text-[var(--tnt-red)]"
                    >
                      Admin Dashboard
                    </Link>
                  )}
                  <div className="py-3 border-t border-[var(--tnt-line)]">
                    {signOutSlot}
                  </div>
                </>
              ) : (
                <div className="flex gap-3 pt-4 border-t border-[var(--tnt-line)] mt-1">
                  <Link
                    href="/auth/signin"
                    onClick={close}
                    className="tnt-btn tnt-btn--ghost flex-1"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/auth/signup"
                    onClick={close}
                    className="tnt-btn flex-1"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
