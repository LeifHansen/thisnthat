"use client";

import { useEffect } from "react";
import type { Metric } from "web-vitals";

// Reports Core Web Vitals WITH attribution, so we can pinpoint the exact element
// behind a layout shift (CLS) or slow LCP from real field traffic — not guesses.
// Logs to the console in dev and beacons every metric to /api/vitals, which logs
// a compact line server-side (visible in `fly logs`). Zero UI.
export function WebVitalsReporter() {
  useEffect(() => {
    let cancelled = false;
    import("web-vitals/attribution")
      .then(({ onCLS, onLCP, onINP }) => {
        if (cancelled) return;

        const report = (metric: Metric) => {
          const attribution =
            (metric as { attribution?: Record<string, unknown> }).attribution ?? {};
          // The single most useful field per metric: the element selector.
          const target =
            (attribution.largestShiftTarget as string) ||
            (attribution.element as string) ||
            (attribution.interactionTarget as string) ||
            null;

          if (process.env.NODE_ENV !== "production") {
            console.info(
              `[web-vitals] ${metric.name} ${metric.rating} ${
                Math.round(metric.value * 1000) / 1000
              } → ${target ?? "—"}`,
              attribution,
            );
          }

          try {
            navigator.sendBeacon?.(
              "/api/vitals",
              JSON.stringify({
                name: metric.name,
                value: Math.round(metric.value * 1000) / 1000,
                rating: metric.rating,
                path: location.pathname,
                target,
              }),
            );
          } catch {
            // sendBeacon unavailable / blocked — fine, drop it.
          }
        };

        onCLS(report);
        onLCP(report);
        onINP(report);
      })
      .catch(() => {
        // web-vitals failed to load — never break the page over telemetry.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
