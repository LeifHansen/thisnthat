import { formatCents } from "@/lib/fees";
import type { Trends } from "./data";

/**
 * "Over time" panel for the admin overview: small multiples of weekly growth
 * series (users, listings, paid orders, GMV, auth submissions, seller payouts
 * going live), rendered as
 * server-side inline SVG — no chart library, no client bundle.
 *
 * Chart conventions (deliberate):
 * - One hue everywhere. Each panel is a single titled series, so color has no
 *   identity job to do — per-metric hues would only re-introduce a
 *   colorblind-unsafe categorical set (the brand's mid-tone hues fail CVD
 *   separation checks as a group).
 * - Bars carry a native <title> tooltip; the latest bar is direct-labeled.
 * - A plain data table below the grid is the accessible/screen-reader view.
 */

const BAR = "#8b66d9"; // --bx-purple: 3:1+ on white, used for every series
const GRID = "#ece5d9"; // --bx-line
const MUTED = "#7c7690";

const W = 280;
const H = 96;
const TOP = 16; // headroom for the direct label
const BASE = H - 14; // baseline y; below it, the x labels

function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Columns({
  weeks,
  values,
  format,
}: {
  weeks: string[];
  values: number[];
  format: (v: number) => string;
}) {
  const max = Math.max(...values, 1);
  const slot = W / weeks.length;
  const gap = 4;
  const barW = Math.max(4, slot - gap);
  const lastIdx = values.length - 1;
  const lastX = lastIdx * slot + slot / 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Weekly values, ${weekLabel(weeks[0])} to ${weekLabel(weeks[lastIdx])}: ${values
        .map((v) => format(v))
        .join(", ")}`}
    >
      {/* Recessive grid: baseline + midline only */}
      <line x1="0" y1={BASE} x2={W} y2={BASE} stroke={GRID} strokeWidth="1" />
      <line
        x1="0"
        y1={TOP + (BASE - TOP) / 2}
        x2={W}
        y2={TOP + (BASE - TOP) / 2}
        stroke={GRID}
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(3, ((BASE - TOP) * v) / max) : 0;
        const x = i * slot + (slot - barW) / 2;
        return (
          <g key={weeks[i]}>
            {/* Full-height hover target so small bars are still hoverable */}
            <rect x={i * slot} y={TOP} width={slot} height={BASE - TOP} fill="transparent">
              <title>{`Week of ${weekLabel(weeks[i])}: ${format(v)}`}</title>
            </rect>
            {v > 0 && (
              <rect
                x={x}
                y={BASE - h}
                width={barW}
                height={h}
                rx="3"
                fill={BAR}
                className="pointer-events-none"
              />
            )}
          </g>
        );
      })}
      {/* Direct label: latest week's value */}
      <text
        x={Math.min(lastX, W - 2)}
        y={BASE - Math.max(3, ((BASE - TOP) * values[lastIdx]) / max) - 4}
        textAnchor={lastIdx === 0 ? "start" : "end"}
        fontSize="10"
        fontWeight="700"
        fill="#201c2b"
      >
        {format(values[lastIdx])}
      </text>
      {/* X extent labels */}
      <text x="0" y={H - 2} fontSize="8.5" fill={MUTED}>
        {weekLabel(weeks[0])}
      </text>
      <text x={W} y={H - 2} textAnchor="end" fontSize="8.5" fill={MUTED}>
        {weekLabel(weeks[lastIdx])}
      </text>
    </svg>
  );
}

function Panel({
  label,
  weeks,
  values,
  format = (v: number) => v.toLocaleString(),
  totalLabel,
}: {
  label: string;
  weeks: string[];
  values: number[];
  format?: (v: number) => string;
  totalLabel?: string;
}) {
  const total = values.reduce((s, v) => s + v, 0);
  return (
    <div className="bx-panel p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </p>
        <p className="text-sm font-bold text-ink">
          {totalLabel ?? format(total)}
          <span className="text-muted font-normal text-xs"> / 12 wk</span>
        </p>
      </div>
      <Columns weeks={weeks} values={values} format={format} />
    </div>
  );
}

export function AdminTrends({ trends }: { trends: Trends | null }) {
  if (!trends) return null;
  const { weeks } = trends;
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-ink text-2xl">Trends</h2>
        <span className="text-muted text-xs">weekly · last 12 weeks</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Panel label="New users" weeks={weeks} values={trends.newUsers} />
        <Panel label="New listings" weeks={weeks} values={trends.newListings} />
        <Panel label="Paid orders" weeks={weeks} values={trends.paidOrders} />
        <Panel
          label="GMV (captured)"
          weeks={weeks}
          values={trends.gmvCents}
          format={(v) => formatCents(v)}
        />
        <Panel
          label="Paid auth submissions"
          weeks={weeks}
          values={trends.authPaid}
        />
        {/* Stamped only from the deploy that added the column onward, so weeks
            before it read 0 rather than unknown. */}
        <Panel
          label="Seller payouts went live"
          weeks={weeks}
          values={trends.payoutEnabled}
        />
      </div>

      {/* Accessible/table view of the same data */}
      <details className="bx-panel p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-ink">
          Data table
        </summary>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted border-b border-[var(--bx-line)]">
                <th className="py-1.5 pr-3">Week of</th>
                <th className="py-1.5 pr-3">New users</th>
                <th className="py-1.5 pr-3">New listings</th>
                <th className="py-1.5 pr-3">Paid orders</th>
                <th className="py-1.5 pr-3">GMV</th>
                <th className="py-1.5 pr-3">Paid auth</th>
                <th className="py-1.5">Payouts live</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, i) => (
                <tr key={w} className="border-b border-[var(--bx-line)] last:border-0">
                  <td className="py-1 pr-3 text-muted">{weekLabel(w)}</td>
                  <td className="py-1 pr-3">{trends.newUsers[i]}</td>
                  <td className="py-1 pr-3">{trends.newListings[i]}</td>
                  <td className="py-1 pr-3">{trends.paidOrders[i]}</td>
                  <td className="py-1 pr-3">{formatCents(trends.gmvCents[i])}</td>
                  <td className="py-1 pr-3">{trends.authPaid[i]}</td>
                  <td className="py-1">{trends.payoutEnabled[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
