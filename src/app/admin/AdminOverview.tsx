import Link from "next/link";
import { formatCents, PLATFORM_FEE_LABEL } from "@/lib/fees";
import { statusLabel } from "@/lib/orderState";
import {
  ORDER_STATUSES,
  STUCK_AFTER_DAYS,
  type Kpis,
  type QueueCounts,
} from "./data";

/**
 * The admin "report snapshot" — a single colored KPI grid plus two
 * breakdowns (orders by status, listings by category). Shared by the
 * standalone /admin overview page and the superadmin's dashboard Admin tab.
 *
 * Tiles that map onto an admin workspace (users, listings, orders) are
 * themselves the links to that workspace, so there's one tile per concept
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

function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

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
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <Tile
              tone="green"
              label="GMV (completed)"
              value={formatCents(kpis.gmvCents)}
              sub={`${formatCents(kpis.escrowCents)} still in escrow`}
            />
            <Tile
              tone="amber"
              label={`Platform fees (${PLATFORM_FEE_LABEL})`}
              value={formatCents(kpis.revenueCents)}
              sub="earned on completed orders"
            />
            <Tile
              tone="blue"
              label="Orders"
              value={kpis.totalOrders.toLocaleString()}
              sub={`${kpis.paidOrders.toLocaleString()} paid · ${kpis.completedOrders.toLocaleString()} completed`}
              href="/admin/orders"
            />
            {/* The one pile of work an admin actually has: paid orders the
                seller is sitting on. Deep-links to the same filter on the
                Orders queue. */}
            <Tile
              tone="pink"
              label="Stuck orders"
              value={queue.stuck.toLocaleString()}
              sub={`unshipped after ${STUCK_AFTER_DAYS} days · ${plural(queue.inFlight, "order")} in flight`}
              href="/admin/orders?status=stuck"
              badge={queue.stuck}
            />
            <Tile
              tone="purple"
              label="Users"
              value={kpis.users.toLocaleString()}
              sub={`${kpis.newUsers7d.toLocaleString()} new this week · ${plural(kpis.admins, "admin")}${
                kpis.suspended ? ` · ${kpis.suspended} suspended` : ""
              }`}
              href={superadmin ? "/admin/users" : undefined}
            />
            <Tile
              tone="blue"
              label="Active listings"
              value={kpis.listingsByStatus.ACTIVE.toLocaleString()}
              sub={`${kpis.listingsByStatus.DRAFT.toLocaleString()} draft · ${kpis.listingsByStatus.SOLD.toLocaleString()} sold · ${kpis.listingsByStatus.REMOVED.toLocaleString()} removed`}
              href="/admin/listings"
            />
            <Tile
              tone="amber"
              label="Pending offers"
              value={kpis.pendingOffers.toLocaleString()}
              sub="awaiting a seller's answer"
            />
            <Tile
              tone="purple"
              label="Unread messages"
              value={kpis.unreadMessages.toLocaleString()}
              sub="across all conversations"
            />
            {/* The Stripe Connect funnel, as a rate rather than a count. A seller
                can't be paid without finishing onboarding, and the two numbers
                answer different questions: a low "started" means nobody is
                finding the prompt, while a wide started→live gap means they are
                finding it and abandoning Stripe's form. */}
            <Tile
              tone="green"
              label="Seller payouts live"
              value={
                kpis.sellers > 0
                  ? `${Math.round((kpis.payoutEnabled / kpis.sellers) * 100)}%`
                  : "—"
              }
              sub={`${kpis.payoutEnabled.toLocaleString()} of ${plural(kpis.sellers, "seller")}`}
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
              tone="purple"
              label="AI blog generator"
              value="Write a post"
              sub="Draft & publish editorial"
              href="/admin/blog"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <section className="tnt-panel p-4 space-y-2">
              <h3 className="text-ink font-bold">Orders by status</h3>
              <ul className="divide-y divide-[var(--tnt-line)] text-sm">
                {ORDER_STATUSES.map((s) => (
                  <li key={s} className="flex items-center justify-between gap-3 py-1.5">
                    <Link
                      href={`/admin/orders?status=${s}`}
                      className="!text-ink hover:!text-[var(--tnt-red)] font-medium"
                    >
                      {statusLabel(s)}
                      <span className="text-muted font-normal text-xs">
                        {" "}
                        · {s.replace(/_/g, " ")}
                      </span>
                    </Link>
                    <span className="font-semibold tabular-nums">
                      {kpis.ordersByStatus[s].toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="tnt-panel p-4 space-y-2">
              <h3 className="text-ink font-bold">Listings by category</h3>
              {kpis.categories.length === 0 ? (
                <p className="text-muted text-sm">
                  No categories seeded yet — run the Prisma seed.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-[var(--tnt-line)]">
                      <th className="py-1.5 pr-3 font-semibold">Category</th>
                      <th className="py-1.5 pr-3 font-semibold text-right">Active</th>
                      <th className="py-1.5 font-semibold text-right">All-time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.categories.map((c) => (
                      <tr key={c.id} className="border-b border-[var(--tnt-line)] last:border-0">
                        <td className="py-1.5 pr-3">
                          <Link
                            href={`/admin/listings?category=${encodeURIComponent(c.slug)}`}
                            className="!text-ink hover:!text-[var(--tnt-red)] font-medium"
                          >
                            {c.name}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
                          {c.active.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right text-muted tabular-nums">
                          {c.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
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
