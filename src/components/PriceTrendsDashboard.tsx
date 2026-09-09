"use client";

import { useRef, useState, useMemo } from "react";
import { formatCents } from "@/lib/fees";
import { PriceTrendChart } from "@/components/PriceTrendChart";
import type { SeriesPoint, SoldStats } from "@/lib/sold-stats";

type RecentSale = {
  beanieName: string;
  title: string;
  priceCents: number;
  condition: string | null;
  buyingFormat: string | null;
  soldAt: string;
  link: string | null;
};

export type TrendsPayload = {
  key: string | null;
  from: string;
  to: string;
  stats: SoldStats;
  series: SeriesPoint[];
  recent: RecentSale[];
};

type BeanieOption = { key: string; name: string; count: number };

const PRESETS = [
  { key: "90d", label: "90 days", months: 3 },
  { key: "6m", label: "6 months", months: 6 },
  { key: "1y", label: "1 year", months: 12 },
  { key: "2y", label: "2 years", months: 24 },
  { key: "all", label: "All time", months: 180 },
] as const;

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bx-panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="text-2xl font-extrabold text-[var(--bx-ink)] leading-tight mt-1">
        {value}
      </p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

export function PriceTrendsDashboard({
  initial,
  beanies,
}: {
  initial: TrendsPayload;
  beanies: BeanieOption[];
}) {
  const [data, setData] = useState<TrendsPayload>(initial);
  const [selKey, setSelKey] = useState<string>("");
  const [beanieInput, setBeanieInput] = useState<string>("");
  const [preset, setPreset] = useState<string>("1y");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  // Monotonic request id so an out-of-order response can't overwrite a newer one.
  const loadSeq = useRef(0);

  // Rebuilding this map on every keystroke in the filter input added up —
  // the beanies-with-data list is a few hundred entries.
  const byName = useMemo(
    () => new Map(beanies.map((b) => [b.name.toLowerCase(), b])),
    [beanies],
  );

  function rangeFor(presetKey: string, cf: string, ct: string): { from: Date; to: Date } {
    if (cf || ct) {
      return {
        from: cf ? new Date(cf) : monthsAgo(12),
        to: ct ? new Date(`${ct}T23:59:59`) : new Date(),
      };
    }
    const p = PRESETS.find((x) => x.key === presetKey) ?? PRESETS[2];
    return { from: monthsAgo(p.months), to: new Date() };
  }

  async function load(key: string, presetKey: string, cf: string, ct: string) {
    const myReq = ++loadSeq.current;
    const { from, to } = rangeFor(presetKey, cf, ct);
    const qs = new URLSearchParams();
    if (key) qs.set("key", key);
    qs.set("from", from.toISOString());
    qs.set("to", to.toISOString());
    setLoading(true);
    try {
      const res = await fetch(`/api/sold/trends?${qs.toString()}`);
      const json = await res.json();
      // Ignore a response superseded by a newer filter change.
      if (myReq !== loadSeq.current) return;
      if (json.ok) setData(json as TrendsPayload);
    } finally {
      if (myReq === loadSeq.current) setLoading(false);
    }
  }

  function chooseBeanie(name: string) {
    setBeanieInput(name);
    const hit = byName.get(name.trim().toLowerCase());
    const key = hit?.key ?? "";
    setSelKey(key);
    load(key, preset, customFrom, customTo);
  }

  function clearBeanie() {
    setBeanieInput("");
    setSelKey("");
    load("", preset, customFrom, customTo);
  }

  function choosePreset(p: string) {
    setPreset(p);
    setCustomFrom("");
    setCustomTo("");
    load(selKey, p, "", "");
  }

  const { stats } = data;
  const title = data.key
    ? (beanies.find((b) => b.key === data.key)?.name ?? beanieInput) || "Selected beanie"
    : "All beanies";

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bx-panel p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="trend-beanie"
              className="text-xs font-semibold text-[var(--bx-ink-soft)]"
            >
              Beanie
            </label>
            <div className="flex gap-2 mt-1">
              <input
                id="trend-beanie"
                className="bx-input"
                list="beanie-options"
                placeholder="All beanies — type to filter…"
                value={beanieInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setBeanieInput(v);
                  if (byName.has(v.trim().toLowerCase())) chooseBeanie(v);
                }}
              />
              <datalist id="beanie-options">
                {beanies.map((b) => (
                  <option key={b.key} value={b.name}>
                    {b.count} sold
                  </option>
                ))}
              </datalist>
              {selKey && (
                <button
                  type="button"
                  onClick={clearBeanie}
                  className="bx-btn bx-btn--ghost !py-2 shrink-0"
                >
                  All
                </button>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="trend-from"
              className="text-xs font-semibold text-[var(--bx-ink-soft)]"
            >
              Custom date range
            </label>
            <div className="flex items-center gap-2 mt-1">
              <input
                id="trend-from"
                type="date"
                aria-label="From date"
                className="bx-input"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setPreset("custom");
                  load(selKey, "custom", e.target.value, customTo);
                }}
              />
              <span className="text-muted text-sm">→</span>
              <input
                type="date"
                aria-label="To date"
                className="bx-input"
                value={customTo}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setPreset("custom");
                  load(selKey, "custom", customFrom, e.target.value);
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => choosePreset(p.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                preset === p.key
                  ? "bg-[var(--bx-ink)] text-white border-[var(--bx-ink)]"
                  : "bg-white text-[var(--bx-ink-soft)] border-[var(--bx-line-strong)] hover:border-[var(--bx-muted)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary + chart */}
      <div>
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-xl font-bold">
            {title}
            <span className="ml-2 text-sm font-normal text-muted">
              {fmtDate(data.from)} – {fmtDate(data.to)}
            </span>
          </h2>
          {loading && <span className="text-xs text-muted">Updating…</span>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Tile
            label="Median sold"
            value={stats.medianCents != null ? formatCents(stats.medianCents) : "—"}
            sub={`${stats.count} sale${stats.count === 1 ? "" : "s"}`}
          />
          <Tile
            label="Average"
            value={stats.avgCents != null ? formatCents(stats.avgCents) : "—"}
          />
          <Tile
            label="Range"
            value={
              stats.minCents != null && stats.maxCents != null
                ? `${formatCents(stats.minCents)}–${formatCents(stats.maxCents)}`
                : "—"
            }
          />
          <Tile
            label="Last sold"
            value={stats.lastSoldAt ? fmtDate(String(stats.lastSoldAt)) : "—"}
          />
        </div>

        {stats.count > 0 && stats.medianCents != null && (
          <div className="bx-panel bx-panel--accent p-4 mb-5 text-sm">
            <span className="font-semibold text-[var(--bx-ink)]">
              💡 Suggested pricing
            </span>{" "}
            — based on {stats.count} recent sale
            {stats.count === 1 ? "" : "s"}, a fair market price is about{" "}
            <span className="font-bold text-[var(--bx-red)]">
              {formatCents(stats.medianCents)}
            </span>
            .
            {stats.minCents != null && stats.maxCents != null && (
              <>
                {" "}
                Priced to move, they sell near {formatCents(stats.minCents)};
                standout examples reach {formatCents(stats.maxCents)}.
              </>
            )}
          </div>
        )}

        <div className="bx-panel p-4">
          <PriceTrendChart series={data.series} />
        </div>
      </div>

      {/* Recent sales */}
      {data.recent.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-2">Recent sales</h3>
          <div className="bx-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted border-b border-[var(--bx-line)]">
                    <th className="px-4 py-2.5 font-semibold">Sold</th>
                    <th className="px-4 py-2.5 font-semibold">Item</th>
                    <th className="px-4 py-2.5 font-semibold">Condition</th>
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r, i) => (
                    <tr
                      key={`${r.title}-${r.soldAt}-${i}`}
                      className="border-b border-[var(--bx-line)] last:border-0"
                    >
                      <td className="px-4 py-2.5 text-muted whitespace-nowrap">
                        {fmtDate(r.soldAt)}
                      </td>
                      <td className="px-4 py-2.5 max-w-md">
                        {r.link ? (
                          <a
                            href={r.link}
                            target="_blank"
                            rel="noopener nofollow noreferrer"
                            className="!text-[var(--bx-ink)] hover:!text-[var(--bx-red)] line-clamp-1"
                          >
                            {r.title}
                          </a>
                        ) : (
                          <span className="line-clamp-1">{r.title}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted whitespace-nowrap">
                        {r.condition ?? "—"}
                        {r.buyingFormat ? (
                          <span className="block text-[10px] text-[var(--bx-muted)]">
                            {r.buyingFormat}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-[var(--bx-red)] whitespace-nowrap">
                        {formatCents(r.priceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted mt-2">
            Prices are recent completed eBay sales, ingested for reference. Beanie
            Xchange isn&apos;t affiliated with eBay or Ty Inc.
          </p>
        </div>
      )}
    </div>
  );
}
