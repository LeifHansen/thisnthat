import Link from "next/link";
import { formatCents } from "@/lib/fees";
import type { Kpis, QueueCounts } from "./data";

/**
 * The admin "report snapshot" — a single colored KPI grid. Shared by the
 * standalone /admin overview page and the superadmin's dashboard Admin tab.
 *
 * Tiles that map onto an admin workspace (users, listings, the two queues)
 * are themselves the links to that workspace, so there's one tile per concept
 * instead of a static stat plus a duplicate quick-link.
 */

type Tone = "green" | "blue" | "purple" | "pink" | "amber";

// Soft tint / value color / border, drawn from the brand palette. Blue and
// amber have no `-soft` var yet, so their tints are inlined here.
const TONES: Record<Tone, { bg: string; fg: string; ring: string }> = {
  green: { bg: "var(--tnt-green-soft)", fg: "var(--tnt-green)", ring: "var(--tnt-green)" },
  blue: { bg: "#e7f0fc", fg: "var(--tnt-blue)", ring: "var(--tnt-blue)" },
  purple: { bg: "var(--tnt-purple-soft)", fg: "var(--tnt-purple-text)", ring: "var(--tnt-purple)" },
  pink: { bg: "var(--tnt-red-soft)", fg: "var(--tnt-red)", ring: "var(--tnt-red)" },
  amber: { bg: "#fbf1d6", fg: "#a9790f", ring: "var(--tnt-yellow)" },
};

export function AdminOverview({
  kpis,
  queue,
  superadmin,
}: {
  kpis: Kpis | null;
  queue: QueueCounts;
  superadmin: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-ink text-2xl">Report snapshot</h2>
        <span className="text-muted text-xs">
          {new Date().toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      </div>

      {!kpis ? (
        <div className="tnt-panel p-8 text-center text-[var(--tnt-red)]">
          Couldn&apos;t load metrics. The database schema may be out of date in
          this environment.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Tile tone="green" label="GMV (captured)" value={formatCents(kpis.gmvCents)} />
          {/* Marketplace fees + authentication service fees — auth sales
              never touch the Order table, so they'd otherwise read as $0. */}
          <Tile
            tone="amber"
            label="Platform revenue"
            value={formatCents(kpis.revenueCents + kpis.authRevenueCents)}
            sub={`${formatCents(kpis.revenueCents)} marketplace · ${formatCents(kpis.authRevenueCents)} auth`}
          />
          <Tile tone="blue" label="Paid orders" value={kpis.paidOrders.toLocaleString()} />
          <Tile
            tone="pink"
            label="Auth sales"
            value={formatCents(kpis.authRevenueCents)}
            sub={`${kpis.authPaidCount.toLocaleString()} paid submission${
              kpis.authPaidCount === 1 ? "" : "s"
            }`}
            href="/admin/queue"
          />
          <Tile
            tone="green"
            label="Completed orders"
            value={kpis.completedOrders.toLocaleString()}
          />
          <Tile
            tone="purple"
            label="Users"
            value={kpis.users.toLocaleString()}
            sub={`${kpis.admins} admin${kpis.admins === 1 ? "" : "s"}${
              kpis.suspended ? ` · ${kpis.suspended} suspended` : ""
            }`}
            href={superadmin ? "/admin/users" : undefined}
          />
          <Tile
            tone="blue"
            label="Active listings"
            value={kpis.activeListings.toLocaleString()}
            sub={`${kpis.totalListings.toLocaleString()} all-time`}
            href="/admin/listings"
          />
          {/* The queue page holds two independent piles of work — paid
              authentication submissions and new beanies awaiting a catalogue
              decision — so each gets its own tile and deep-links to its
              section instead of sharing one ambiguous count. */}
          <Tile
            tone="pink"
            label="Auth queue"
            value={queue.auth.toLocaleString()}
            sub="submissions awaiting action"
            href="/admin/queue#auth-queue"
            badge={queue.auth}
          />
          <Tile
            tone="amber"
            label="Database queue"
            value={queue.database.toLocaleString()}
            sub="new beanies to review"
            href="/admin/queue#database-queue"
            badge={queue.database}
          />
          {/* The Stripe Connect funnel, as a rate rather than a count. A seller
              can't be paid without finishing onboarding, and the two numbers
              answer different questions: a low "started" means nobody is
              finding the prompt, while a wide started→live gap means they are
              finding it and abandoning Stripe's form. Both were previously
              invisible — the only signal anywhere was a per-row badge on the
              users table. */}
          <Tile
            tone="green"
            label="Seller payouts live"
            value={
              kpis.sellers > 0
                ? `${Math.round((kpis.payoutEnabled / kpis.sellers) * 100)}%`
                : "—"
            }
            sub={`${kpis.payoutEnabled.toLocaleString()} of ${kpis.sellers.toLocaleString()} seller${
              kpis.sellers === 1 ? "" : "s"
            }`}
          />
          <Tile
            tone="pink"
            label="Payout setup started"
            value={kpis.payoutStarted.toLocaleString()}
            sub={
              kpis.payoutStarted > kpis.payoutEnabled
                ? `${(kpis.payoutStarted - kpis.payoutEnabled).toLocaleString()} not finished`
                : "all finished"
            }
          />
          <Tile
            tone="amber"
            label="Registry entries"
            value={kpis.registry.toLocaleString()}
          />
          {superadmin && (
            <Tile
              tone="blue"
              label="True Blue link clicks"
              value={kpis.trueBlueClicks.toLocaleString()}
              sub="all-time outbound"
            />
          )}
          <Tile
            tone="purple"
            label="AI blog generator"
            value="Write a post"
            sub="Draft & publish editorial"
            href="/admin/blog"
          />
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
  href,
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
  href?: string;
  badge?: number;
}) {
  const t = TONES[tone];
  const style = { background: t.bg, borderColor: t.ring };

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: t.fg }}
        >
          {label}
        </p>
        {badge ? (
          <span
            className="rounded-full text-white text-xs font-bold px-2 py-0.5"
            style={{ background: t.fg }}
          >
            {badge}
          </span>
        ) : href ? (
          <span aria-hidden className="text-lg leading-none" style={{ color: t.fg }}>
            →
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-2xl font-bold" style={{ color: t.fg }}>
        {value}
      </p>
      {sub ? <p className="text-muted text-xs mt-0.5">{sub}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        style={style}
        className="tnt-panel p-4 block transition-transform hover:-translate-y-0.5"
      >
        {body}
      </Link>
    );
  }
  return (
    <div style={style} className="tnt-panel p-4">
      {body}
    </div>
  );
}
