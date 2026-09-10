"use client";

import { useState } from "react";

// What /api/listing-optimize takes: the listing as it stands in the edit form.
export type OptimizeInput = {
  title: string;
  brand: string;
  itemName: string;
  categorySlug: string;
  condition: string;
  attributes: Record<string, string>;
  description: string;
  photos: string[];
};

type OptimizeResult = {
  optimizedTitle: string;
  optimizedDescription: string;
  keywords: string[];
  photoPlan: {
    recommendedOrder: number[];
    coverIndex: number;
    tips: string[];
    missingShots: string[];
  };
};

export function ListingOptimizer({
  getInput,
  onApplyTitle,
  onApplyDescription,
  onApplyOrder,
}: {
  getInput: () => OptimizeInput;
  onApplyTitle: (title: string) => void;
  onApplyDescription: (description: string) => void;
  onApplyOrder: (order: number[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<OptimizeResult | null>(null);

  async function run() {
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const res = await fetch("/api/listing-optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(getInput()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not optimize");
      const r = data as OptimizeResult;
      setResult(r);
      // Everything lands in the form immediately — no separate apply step.
      // The seller still reviews before saving the listing itself.
      if (r.optimizedTitle) onApplyTitle(r.optimizedTitle);
      if (r.optimizedDescription) onApplyDescription(r.optimizedDescription);
      if (
        r.photoPlan.recommendedOrder.length > 0 &&
        r.photoPlan.recommendedOrder.some((v, i) => v !== i)
      ) {
        onApplyOrder(r.photoPlan.recommendedOrder);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not optimize");
    } finally {
      setBusy(false);
    }
  }

  const reordered =
    result &&
    result.photoPlan.recommendedOrder.length > 0 &&
    result.photoPlan.recommendedOrder.some((v, i) => v !== i);

  return (
    <div className="tnt-panel p-4 space-y-3 bg-[var(--tnt-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">✨ Optimize for discoverability</p>
          <p className="text-xs text-muted">
            AI rewrites your title &amp; description with the terms buyers
            search, reviews your photos&apos; presentation, and updates the
            form for you — review, tweak anything, then save.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="tnt-btn tnt-btn--ghost shrink-0 disabled:opacity-60"
        >
          {busy ? "Optimizing…" : result ? "Re-run" : "Optimize listing"}
        </button>
      </div>

      {err && <p className="text-pink text-sm">{err}</p>}

      {result && (
        <div className="space-y-4 pt-1">
          {/* Title */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Optimized title
              </span>
              <span className="text-xs font-semibold text-[var(--tnt-red)]">
                ✓ Applied
              </span>
            </div>
            <p className="text-sm text-ink bg-white rounded-lg border border-[var(--tnt-line)] px-3 py-2">
              {result.optimizedTitle}
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Optimized description
              </span>
              <span className="text-xs font-semibold text-[var(--tnt-red)]">
                ✓ Applied
              </span>
            </div>
            <p className="text-sm text-ink whitespace-pre-line bg-white rounded-lg border border-[var(--tnt-line)] px-3 py-2">
              {result.optimizedDescription}
            </p>
          </div>

          {/* Keywords */}
          {result.keywords.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Search keywords buyers use
              </span>
              <div className="flex flex-wrap gap-1.5">
                {result.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-white border border-[var(--tnt-line-strong)] px-2.5 py-1 text-xs text-[var(--tnt-ink-soft)]"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Photo plan */}
          {(reordered ||
            result.photoPlan.tips.length > 0 ||
            result.photoPlan.missingShots.length > 0) && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Photo presentation
              </span>
              {reordered && (
                <div className="flex items-center justify-between gap-2 bg-white rounded-lg border border-[var(--tnt-line)] px-3 py-2">
                  <span className="text-sm text-ink">
                    Photos reordered best-first for a stronger cover image.
                  </span>
                  <span className="text-xs font-semibold text-[var(--tnt-red)] shrink-0">
                    ✓ Reordered
                  </span>
                </div>
              )}
              {result.photoPlan.tips.length > 0 && (
                <ul className="text-sm text-muted space-y-1 list-disc pl-5">
                  {result.photoPlan.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
              {result.photoPlan.missingShots.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted">Consider adding: </span>
                  <span className="text-ink">
                    {result.photoPlan.missingShots.join(" · ")}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
