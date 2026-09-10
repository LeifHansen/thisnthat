import type { Metadata } from "next";
import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { formatCents, PLATFORM_FEE_LABEL } from "@/lib/fees";
import { getPayoutState, type PayoutState } from "@/lib/payout";
import { statusLabel } from "@/lib/orderState";
import { ConnectButton } from "@/components/ConnectButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payouts",
  robots: { index: false },
};

// Orders whose money is somewhere in the pipeline. PENDING_PAYMENT (card not
// yet authorized), REFUNDED and CANCELLED never reach the seller and are left
// out.
const HELD: OrderStatus[] = ["PAID_ESCROW", "AWAITING_SHIP_TO_BUYER", "SHIPPED_TO_BUYER"];

const ORDER_SELECT = {
  id: true,
  status: true,
  itemCents: true,
  platformFeeCents: true,
  stripeTransferId: true,
  createdAt: true,
  updatedAt: true,
  listing: { select: { title: true } },
} as const;

type Row = {
  id: string;
  status: OrderStatus;
  itemCents: number;
  platformFeeCents: number;
  stripeTransferId: string | null;
  createdAt: Date;
  updatedAt: Date;
  listing: { title: string };
};

const proceeds = (o: Row) => Math.max(0, o.itemCents - o.platformFeeCents);
const sum = (rows: Row[]) => rows.reduce((n, o) => n + proceeds(o), 0);
const day = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Why a held order's money hasn't moved yet, in the seller's terms. */
function holdReason(status: OrderStatus): string {
  switch (status) {
    case "PAID_ESCROW":
    case "AWAITING_SHIP_TO_BUYER":
      return "Waiting for you to ship — mark it shipped with tracking.";
    case "SHIPPED_TO_BUYER":
      return "In transit — released when the buyer confirms receipt or the carrier reports delivery.";
    default:
      return statusLabel(status);
  }
}

function connectSummary(state: PayoutState, configured: boolean): { title: string; body: string } {
  if (!configured) {
    return {
      title: "Payments aren't configured on this deployment",
      body: "Stripe keys are not set, so there is nothing to connect yet. In production this card shows your Stripe Connect status.",
    };
  }
  switch (state.status) {
    case "enabled":
      return {
        title: "Payouts enabled",
        body: "Your Stripe account can receive transfers. Each sale is paid out when the buyer confirms delivery.",
      };
    case "pending":
      return {
        title: "Stripe is verifying your details",
        body: state.disabledReason
          ? `Stripe reports: ${state.disabledReason.replace(/_/g, " ")}. Nothing more is needed from you right now.`
          : "Your form is complete; Stripe is checking identity and bank details. Nothing more is needed from you right now.",
      };
    case "incomplete":
      return {
        title: "Finish payout setup",
        body: state.currentlyDue.length
          ? `Stripe still needs: ${state.currentlyDue.map((k) => k.replace(/[._]/g, " ")).join(", ")}.`
          : "Stripe still needs a few details before it can pay you.",
      };
    default:
      return {
        title: "Set up seller payouts",
        body: "Connect a Stripe account (about two minutes) so your sales have somewhere to go. Listings only publish once payouts are enabled.",
      };
  }
}

export default async function PayoutsPage() {
  const user = await requireUser();
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      stripeConnectId: true,
      stripeConnectStartedAt: true,
      stripePayoutsEnabledAt: true,
    },
  });
  if (!me) return null;

  const configured = Boolean(process.env.STRIPE_SECRET_KEY);
  const payout: PayoutState = configured
    ? await getPayoutState(me).catch(() => ({
        status: "incomplete" as const,
        currentlyDue: [],
        disabledReason: null,
      }))
    : { status: "none", currentlyDue: [], disabledReason: null };

  const orders: Row[] = await prisma.order.findMany({
    where: { sellerId: me.id, status: { in: [...HELD, "COMPLETED"] } },
    orderBy: { updatedAt: "desc" },
    select: ORDER_SELECT,
  });

  const held = orders.filter((o) => HELD.includes(o.status));
  const released = orders.filter((o) => o.status === "COMPLETED" && o.stripeTransferId);
  // Captured from the buyer but never transferred — almost always because
  // payouts weren't enabled when the order completed. The money is safe on
  // the platform; the transfer is re-run once the account can receive it.
  const stuck = orders.filter((o) => o.status === "COMPLETED" && !o.stripeTransferId);

  const summary = connectSummary(payout, configured);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl">Payouts</h1>
          <p className="text-muted text-sm">
            What you&apos;re owed, what&apos;s been paid, and why anything is
            still held. Figures are your proceeds: item price minus the{" "}
            {PLATFORM_FEE_LABEL} fee. Buyers pay shipping on top.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm font-semibold !text-[var(--tnt-red)]">
          ← Dashboard
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Held" value={formatCents(sum(held))} hint={`${held.length} order${held.length === 1 ? "" : "s"} in progress`} />
        <Stat label="Released" value={formatCents(sum(released))} hint={`${released.length} payout${released.length === 1 ? "" : "s"} sent`} />
        <Stat
          label="Needs attention"
          value={formatCents(sum(stuck))}
          hint={stuck.length ? `${stuck.length} completed, not yet transferred` : "Nothing outstanding"}
          tone={stuck.length ? "warn" : undefined}
        />
      </div>

      <section id="connect" className="tnt-panel p-5 sm:p-6 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h2 className="text-lg font-bold">{summary.title}</h2>
            <p className="text-sm text-muted max-w-xl">{summary.body}</p>
            <p className="text-xs text-muted">
              {me.stripeConnectStartedAt
                ? `Started ${day(me.stripeConnectStartedAt)}`
                : "Not started"}
              {me.stripePayoutsEnabledAt ? ` · Enabled ${day(me.stripePayoutsEnabledAt)}` : ""}
            </p>
          </div>
          {configured && <ConnectButton status={payout.status} />}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          Held{" "}
          <span className="text-muted text-sm font-normal">
            — released to you on delivery
          </span>
        </h2>
        {held.length === 0 ? (
          <p className="tnt-panel p-5 text-sm text-muted">No sales in progress.</p>
        ) : (
          <div className="tnt-panel divide-y divide-[var(--tnt-line)]">
            {held.map((o) => (
              <div key={o.id} className="p-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 space-y-0.5">
                  <Link href={`/orders/${o.id}`} className="font-semibold !text-ink hover:underline block truncate">
                    {o.listing.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {statusLabel(o.status)} · ordered {day(o.createdAt)}
                  </p>
                  <p className="text-sm text-[var(--tnt-ink-soft)]">{holdReason(o.status)}</p>
                </div>
                <p className="font-bold shrink-0">{formatCents(proceeds(o))}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {stuck.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Needs attention</h2>
          <div className="tnt-panel divide-y divide-[var(--tnt-line)] border-[var(--tnt-yellow)]">
            {stuck.map((o) => (
              <div key={o.id} className="p-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 space-y-0.5">
                  <Link href={`/orders/${o.id}`} className="font-semibold !text-ink hover:underline block truncate">
                    {o.listing.title}
                  </Link>
                  <p className="text-xs text-muted">Completed {day(o.updatedAt)}</p>
                  <p className="text-sm text-[var(--tnt-ink-soft)]">
                    {payout.status === "enabled"
                      ? "The buyer's payment was captured but the transfer hasn't landed yet. It is retried automatically; contact support if it stays here."
                      : "The buyer's payment was captured, but your payouts weren't enabled when the order completed. Finish payout setup above and the transfer will be sent."}
                  </p>
                </div>
                <p className="font-bold shrink-0">{formatCents(proceeds(o))}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Transfer history</h2>
        {released.length === 0 ? (
          <p className="tnt-panel p-5 text-sm text-muted">No payouts yet.</p>
        ) : (
          <div className="tnt-panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Order</th>
                  <th className="p-3">Transfer</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--tnt-line)]">
                {released.map((o) => (
                  <tr key={o.id}>
                    <td className="p-3 whitespace-nowrap">{day(o.updatedAt)}</td>
                    <td className="p-3 min-w-0">
                      <Link href={`/orders/${o.id}`} className="!text-ink hover:underline">
                        {o.listing.title}
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted">{o.stripeTransferId}</td>
                    <td className="p-3 text-right font-semibold whitespace-nowrap">
                      {formatCents(proceeds(o))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warn";
}) {
  return (
    <div className={`tnt-panel p-4 space-y-1 ${tone === "warn" ? "border-[var(--tnt-yellow)]" : ""}`}>
      <p className="text-xs uppercase tracking-wide text-muted font-semibold">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}
