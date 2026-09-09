"use client";

import { useRef, useState } from "react";
import type { SeriesPoint } from "@/lib/sold-stats";

// Dependency-free, responsive SVG chart of monthly sold prices: a median line
// with a soft area fill, a dashed average line, faint volume bars, and a hover
// tooltip. Uses the site's design tokens so it reads in light and dark.

const VB_W = 820;
const VB_H = 340;
const PAD = { top: 20, right: 16, bottom: 44, left: 52 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;
const VOL_BAND = 46; // height at the bottom of the plot reserved for volume bars

function usd0(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}
function usd2(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A "nice" axis max ≥ value (1/2/5 × 10^n), so gridline labels are round. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function PriceTrendChart({ series }: { series: SeriesPoint[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const points = series;
  const withData = points.filter((p) => p.medianCents != null);

  if (points.length === 0 || withData.length === 0) {
    return (
      <div className="grid place-items-center rounded-xl border border-[var(--bx-line)] bg-[var(--bx-surface)] h-64 text-center px-6">
        <p className="text-muted text-sm">
          No sales recorded in this range yet. Once eBay sold data is ingested
          for a beanie, its price trend appears here.
        </p>
      </div>
    );
  }

  const maxPrice = niceMax(
    Math.max(...withData.map((p) => Math.max(p.medianCents ?? 0, p.avgCents ?? 0))),
  );
  const maxVol = Math.max(1, ...points.map((p) => p.count));

  const n = points.length;
  // Center points in their column so bars and dots line up.
  const colW = PLOT_W / n;
  const xAt = (i: number) => PAD.left + colW * (i + 0.5);
  const yAt = (cents: number) =>
    PAD.top + PLOT_H - (cents / maxPrice) * PLOT_H;
  const volH = (count: number) => (count / maxVol) * VOL_BAND;

  // Build the median line/area path across only the points that have a value,
  // but keep x positions on the full month axis so gaps read as gaps.
  const medianPts = points
    .map((p, i) => (p.medianCents != null ? { x: xAt(i), y: yAt(p.medianCents) } : null))
    .filter((p): p is { x: number; y: number } => p != null);
  const line = medianPts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const area =
    medianPts.length > 1
      ? `${line} L${medianPts[medianPts.length - 1].x},${PAD.top + PLOT_H} ` +
        `L${medianPts[0].x},${PAD.top + PLOT_H} Z`
      : "";

  const avgPts = points
    .map((p, i) => (p.avgCents != null ? { x: xAt(i), y: yAt(p.avgCents) } : null))
    .filter((p): p is { x: number; y: number } => p != null);
  const avgLine = avgPts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");

  // Gridlines / y labels.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxPrice * f));

  // X labels: show at most ~8, evenly spaced, always the last.
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * VB_W;
    const i = Math.round((vbX - PAD.left) / colW - 0.5);
    setHover(i >= 0 && i < n ? i : null);
  }

  const hp = hover != null ? points[hover] : null;
  const hx = hover != null ? xAt(hover) : 0;

  return (
    <div className="relative w-full overflow-hidden">
      <svg
        ref={ref}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Monthly median sold price trend"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y gridlines + labels */}
        {ticks.map((t) => {
          const y = yAt(t);
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={VB_W - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--bx-line)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={12}
                fill="var(--bx-muted)"
              >
                {usd0(t)}
              </text>
            </g>
          );
        })}

        {/* Volume bars (faint), anchored to the baseline */}
        {points.map((p, i) => {
          const h = volH(p.count);
          if (h <= 0) return null;
          const bw = Math.max(2, colW * 0.5);
          return (
            <rect
              key={`v${p.period}`}
              x={xAt(i) - bw / 2}
              y={PAD.top + PLOT_H - h}
              width={bw}
              height={h}
              rx={1}
              fill="var(--bx-muted)"
              opacity={0.18}
            />
          );
        })}

        {/* Median area + line */}
        {area && <path d={area} fill="var(--bx-red)" opacity={0.1} />}
        <path d={line} fill="none" stroke="var(--bx-red)" strokeWidth={2.5} />
        {/* Average line (dashed) */}
        {avgPts.length > 1 && (
          <path
            d={avgLine}
            fill="none"
            stroke="var(--bx-ink-soft)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            opacity={0.7}
          />
        )}

        {/* Median dots */}
        {points.map((p, i) =>
          p.medianCents != null ? (
            <circle
              key={`d${p.period}`}
              cx={xAt(i)}
              cy={yAt(p.medianCents)}
              r={hover === i ? 4.5 : 2.5}
              fill="var(--bx-red)"
            />
          ) : null,
        )}

        {/* X labels */}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text
              key={`x${p.period}`}
              x={xAt(i)}
              y={VB_H - 22}
              textAnchor="middle"
              fontSize={11}
              fill="var(--bx-muted)"
            >
              {p.label}
            </text>
          ) : null,
        )}

        {/* Hover guide */}
        {hp && (
          <line
            x1={hx}
            x2={hx}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke="var(--bx-ink)"
            strokeWidth={1}
            opacity={0.25}
          />
        )}

        {/* Axis labels */}
        <text
          x={PAD.left}
          y={VB_H - 6}
          fontSize={11}
          fill="var(--bx-muted)"
          fontWeight={600}
        >
          Median sold price · bar height = # sales
        </text>
      </svg>

      {/* Tooltip */}
      {hp && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-[var(--bx-line-strong)] bg-white px-3 py-2 text-xs shadow-[var(--bx-shadow-sm)]"
          style={{
            left: `${(hx / VB_W) * 100}%`,
            top: 4,
          }}
        >
          <p className="font-bold text-[var(--bx-ink)]">{hp.label}</p>
          <p className="text-[var(--bx-red)] font-semibold">
            Median {hp.medianCents != null ? usd2(hp.medianCents) : "—"}
          </p>
          {hp.avgCents != null && (
            <p className="text-muted">Avg {usd2(hp.avgCents)}</p>
          )}
          <p className="text-muted">
            {hp.count} sale{hp.count === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
