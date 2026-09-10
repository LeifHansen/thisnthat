"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server component tree a few times, a few seconds apart,
 * then stops. For a page that is waiting on a short server-side step it did
 * not start itself — the prepaid label being bought for a submission that
 * the webhook advanced a moment ago — so the result appears without the
 * user having to know to reload. Bounded so a step that never finishes
 * cannot turn a tab into a polling loop.
 */
export function RefreshWhilePending({
  attempts = 4,
  intervalMs = 3000,
}: {
  attempts?: number;
  intervalMs?: number;
}) {
  const router = useRouter();
  // Survives router.refresh(): server components re-render, this instance
  // stays mounted, so the count carries across refreshes.
  const done = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      done.current += 1;
      if (done.current > attempts) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, attempts, intervalMs]);

  return null;
}
