"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "tnt:signup-prompt-dismissed";
const SHOW_AFTER_MS = 6_000;
// Re-show to visitors who dismissed it a while ago but still haven't joined.
const REMIND_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Don't interrupt people who are already signing up, buying, or working.
const QUIET_PREFIXES = ["/auth", "/checkout", "/cart", "/admin", "/sell"];

/**
 * One-time "create an account" nudge for logged-out visitors. Appears a few
 * seconds after the first page view; dismissing it (or clicking through to
 * sign up) snoozes it via localStorage so it doesn't nag on every visit.
 */
export function SignupPrompt({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const quiet = QUIET_PREFIXES.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (loggedIn || quiet) return;
    try {
      const dismissedAt = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
      if (dismissedAt && Date.now() - dismissedAt < REMIND_AFTER_MS) return;
    } catch {
      // Storage unavailable (private mode etc.) — show once per page load.
    }
    const t = setTimeout(() => setOpen(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [loggedIn, quiet]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // Best effort — worst case it shows again next page load.
    }
  }

  if (!open || loggedIn || quiet) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-prompt-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={dismiss}
        className="absolute inset-0 bg-black/40 cursor-default"
      />
      <div className="relative tnt-panel w-full max-w-md p-6 sm:p-8 text-center shadow-[var(--tnt-shadow-lg)]">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full border border-[var(--tnt-line-strong)] bg-white text-ink text-lg leading-none hover:bg-[var(--tnt-surface)]"
        >
          ×
        </button>

        <Image
          src="/tnt-mark.svg"
          alt=""
          width={512}
          height={512}
          sizes="56px"
          className="mx-auto h-14 w-14"
        />

        <h2
          id="signup-prompt-title"
          className="font-display text-2xl mt-3 text-ink"
        >
          Join This&rsquo;n&rsquo;that
        </h2>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          Create a free account to list what you have, keep tabs on what
          you&apos;re after, and message sellers directly. Listing is free —
          you only pay when something sells.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <Link href="/auth/signup" onClick={dismiss} className="tnt-btn w-full">
            Create your free account
          </Link>
          <Link
            href="/auth/signin"
            onClick={dismiss}
            className="tnt-btn tnt-btn--ghost w-full"
          >
            I already have an account
          </Link>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mt-4 text-xs text-muted underline hover:text-ink"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
