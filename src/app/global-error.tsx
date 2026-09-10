"use client";

// Catches errors thrown in the ROOT layout itself (where a normal error.tsx
// can't reach). Must render its own <html>/<body>. Inline styles only — the
// app's CSS/layout may not be available at this level.
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#faf7f2",
          color: "#1f1a17",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 460 }}>
          <p
            style={{
              color: "#d9553b",
              fontWeight: 700,
              letterSpacing: "0.05em",
              margin: 0,
            }}
          >
            SOMETHING WENT WRONG
          </p>
          <h1 style={{ fontSize: "1.75rem", margin: "0.5rem 0" }}>
            This&rsquo;n&rsquo;that hit an unexpected error
          </h1>
          <p style={{ color: "#7c736c", margin: "0 0 1.5rem" }}>
            Sorry about that. Try again, or head back to browsing.
          </p>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
            }}
          >
            <button
              onClick={reset}
              style={{
                background: "#d9553b",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "0.6rem 1.1rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* Plain <a>: global-error renders outside the router, so next/link
                has no context here. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                background: "#ffffff",
                color: "#1f1a17",
                border: "1px solid #d6cdc0",
                borderRadius: 999,
                padding: "0.6rem 1.1rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
