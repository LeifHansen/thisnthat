"use client";

// Segment-level error boundary — renders inside the root layout (header/footer
// stay). Covers thrown errors in pages/server components below the root.
import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto text-center space-y-4 py-16">
      <p className="tnt-badge mx-auto">Something went wrong</p>
      <h1 className="text-3xl">This page hit an unexpected error</h1>
      <p className="text-muted">
        Sorry about that. Try again, or head back to the marketplace.
      </p>
      <div className="flex gap-3 justify-center pt-2">
        <button className="tnt-btn" onClick={reset}>
          Try again
        </button>
        <Link className="tnt-btn tnt-btn--ghost" href="/">
          Go home
        </Link>
      </div>
    </div>
  );
}
