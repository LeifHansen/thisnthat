import Link from "next/link";
import { formatCents } from "@/lib/fees";
import { tickerData, type TickerEntry } from "@/lib/sold-stats";

// Stock-ticker-style scrolling banner of real Beanie Baby sold prices from the
// eBay data stream. Pure-CSS marquee (see .bx-ticker in globals.css): pauses on
// hover and respects prefers-reduced-motion. Renders nothing until there's data
// so it never shows an empty strip.

function TickerItem({ e }: { e: TickerEntry }) {
  const arrow = e.dir > 0 ? "▲" : e.dir < 0 ? "▼" : null;
  const arrowClass = e.dir > 0 ? "text-emerald-400" : "text-red-400";
  return (
    <span className="bx-ticker__item">
      <span className="font-bold uppercase tracking-wide">{e.name}</span>
      <span className="tabular-nums font-semibold">{formatCents(e.priceCents)}</span>
      {arrow && <span className={arrowClass}>{arrow}</span>}
    </span>
  );
}

export async function SoldTicker() {
  let entries: TickerEntry[] = [];
  try {
    entries = await tickerData(40);
  } catch {
    return null; // DB hiccup → no ticker, page renders fine
  }
  if (entries.length === 0) return null;

  // Keep scroll speed roughly constant regardless of how many beanies there are.
  const durationSeconds = Math.max(24, Math.round(entries.length * 3.5));

  // Two identical groups back-to-back; the track scrolls exactly one group
  // width (-50%) for a seamless loop. The duplicate is hidden from assistive tech.
  const group = (ariaHidden: boolean) => (
    <div className="bx-ticker__group" aria-hidden={ariaHidden || undefined}>
      {entries.map((e, i) => (
        <TickerItem key={`${e.name}-${i}`} e={e} />
      ))}
    </div>
  );

  return (
    <Link
      href="/price-trends"
      className="bx-ticker !text-white group"
      aria-label="Recent Beanie Baby sold prices — open price trends"
    >
      <span className="bx-ticker__label">
        <span className="bx-ticker__dot" aria-hidden />
        Live&nbsp;Sold
      </span>
      <div
        className="bx-ticker__track"
        style={{ animationDuration: `${durationSeconds}s` }}
      >
        {group(false)}
        {group(true)}
      </div>
    </Link>
  );
}
