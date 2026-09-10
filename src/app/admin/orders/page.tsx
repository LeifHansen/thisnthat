import type { Metadata } from "next";
import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { requireAdmin, isSuperadmin } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/fees";
import { statusLabel } from "@/lib/orderState";
import { displayNameOf } from "@/lib/users";
import { AdminHeader } from "../AdminHeader";
import {
  ORDER_STATUSES,
  STUCK_AFTER_DAYS,
  loadQueueCount,
  stuckCutoff,
} from "../data";
import { CancelOrderButton } from "./CancelOrderButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orders · Admin",
  robots: { index: false, follow: false },
};

// Mirrors ADMIN_CANCELLABLE in src/lib/actions.ts: an admin can unwind any
// order that hasn't settled. The action re-checks, so this only decides
// whether to draw the button.
const ADMIN_CANCELLABLE: readonly OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID_ESCROW",
  "AWAITING_SHIP_TO_BUYER",
  "SHIPPED_TO_BUYER",
];

// The "stuck" pseudo-filter is the Orders badge's population: paid, unshipped,
// older than STUCK_AFTER_DAYS.
const STUCK_STATUSES: readonly OrderStatus[] = ["PAID_ESCROW", "AWAITING_SHIP_TO_BUYER"];

type Filter = OrderStatus | "all" | "stuck";
const PAGE_SIZE = 100;

function isOrderStatus(s: string | undefined): s is OrderStatus {
  return ORDER_STATUSES.includes(s as OrderStatus);
}

const STATUS_TONE: Partial<Record<OrderStatus, string>> = {
  COMPLETED: "text-[var(--tnt-green)]",
  REFUNDED: "text-[var(--tnt-red)]",
  CANCELLED: "text-[var(--tnt-red)]",
  PENDING_PAYMENT: "text-muted",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const filter: Filter =
    sp.status === "all" || sp.status === "stuck" || isOrderStatus(sp.status)
      ? sp.status
      : "all";
  const q = (sp.q ?? "").trim().slice(0, 100);

  const where: Prisma.OrderWhereInput = {
    ...(filter === "all"
      ? {}
      : filter === "stuck"
        ? { status: { in: [...STUCK_STATUSES] }, createdAt: { lt: stuckCutoff() } }
        : { status: filter }),
    ...(q
      ? {
          OR: [
            { id: q },
            { stripePaymentIntentId: q },
            { cartId: q },
            { listing: { title: { contains: q, mode: "insensitive" } } },
            { buyer: { name: { contains: q, mode: "insensitive" } } },
            { buyer: { email: { contains: q, mode: "insensitive" } } },
            { guestEmail: { contains: q, mode: "insensitive" } },
            { seller: { name: { contains: q, mode: "insensitive" } } },
            { seller: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  let orders: Awaited<ReturnType<typeof query>> = [];
  let total = 0;
  let counts: Partial<Record<OrderStatus, number>> = {};
  let stuck = 0;
  let loadError = false;
  try {
    const [rows, n, grouped, stuckCount] = await Promise.all([
      query(where),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.order.count({
        where: { status: { in: [...STUCK_STATUSES] }, createdAt: { lt: stuckCutoff() } },
      }),
    ]);
    orders = rows;
    total = n;
    counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    stuck = stuckCount;
  } catch (e) {
    console.error("admin: failed to load orders", e);
    loadError = true;
  }
  const ordersCount = await loadQueueCount();
  const superadmin = isSuperadmin(admin);

  const filterHref = (s: string) =>
    `/admin/orders?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-bold border ${
      active
        ? "bg-[var(--tnt-dark)] !text-white border-[var(--tnt-dark)]"
        : "!text-ink border-[var(--tnt-line)] hover:bg-black/5"
    }`;
  const cutoff = stuckCutoff();

  return (
    <div className="space-y-6">
      <AdminHeader isSuperadmin={superadmin} ordersCount={ordersCount} />

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h1 className="text-ink text-2xl">Orders</h1>
        <span className="text-muted text-sm">
          {total.toLocaleString()} match{total === 1 ? "" : "es"}
          {total > PAGE_SIZE ? ` · showing newest ${PAGE_SIZE}` : ""}
        </span>
      </div>
      <p className="text-muted text-sm">
        Every sale, newest first. Cancelling refunds the buyer (or releases the
        card hold on an unpaid order) and puts the unit back on sale; the seller
        is told either way.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={filterHref("all")} className={chip(filter === "all")}>
          ALL
        </Link>
        <Link
          href={filterHref("stuck")}
          className={chip(filter === "stuck")}
          title={`Paid but unshipped for more than ${STUCK_AFTER_DAYS} days`}
        >
          STUCK{stuck ? ` (${stuck})` : ""}
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={filterHref(s)} className={chip(filter === s)}>
            {s.replace(/_/g, " ")}
            {counts[s] != null ? ` (${counts[s]})` : ""}
          </Link>
        ))}
        <form className="ml-auto flex gap-2" action="/admin/orders" method="get">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <input
            className="tnt-input !py-1.5 max-w-[240px]"
            name="q"
            defaultValue={q}
            placeholder="Search order id / listing / buyer / seller"
          />
          <button className="tnt-btn !py-1.5 !px-3 !text-sm" type="submit">
            Search
          </button>
        </form>
      </div>

      {loadError ? (
        <div className="tnt-panel p-8 text-center text-[var(--tnt-red)]">
          Couldn&apos;t load orders.
        </div>
      ) : orders.length === 0 ? (
        <div className="tnt-panel p-8 text-center text-muted">
          No orders match.
        </div>
      ) : (
        <div className="tnt-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-[var(--tnt-line)]">
                <th className="p-3">Order</th>
                <th className="p-3">Listing</th>
                <th className="p-3">Buyer</th>
                <th className="p-3">Seller</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const isStuck =
                  STUCK_STATUSES.includes(o.status) && o.createdAt < cutoff;
                const tracking = o.shipmentEvents[0];
                return (
                  <tr
                    key={o.id}
                    className="border-b border-[var(--tnt-line)] last:border-0 align-top"
                  >
                    <td className="p-3 whitespace-nowrap">
                      <Link
                        href={`/orders/${o.id}`}
                        className="font-mono text-xs !text-ink hover:!text-[var(--tnt-red)]"
                        title={o.id}
                      >
                        {o.id.slice(-8)}
                      </Link>
                      <p className="text-muted text-xs">
                        {o.createdAt.toISOString().slice(0, 10)}
                      </p>
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/listings/${o.listing.id}`}
                        className="block max-w-[260px] truncate font-medium !text-ink hover:!text-[var(--tnt-red)]"
                      >
                        {o.listing.title}
                      </Link>
                      {tracking?.trackingNumber && (
                        <p className="text-muted text-xs truncate max-w-[260px]">
                          {tracking.carrier ? `${tracking.carrier} ` : ""}
                          {tracking.trackingNumber} · {tracking.status}
                        </p>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <Party
                        user={o.buyer}
                        guestEmail={o.guestEmail}
                        superadmin={superadmin}
                      />
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <Party user={o.seller} superadmin={superadmin} />
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="font-semibold">{formatCents(o.totalCents)}</span>
                      <p className="text-muted text-xs">
                        item {formatCents(o.itemCents)} · fee{" "}
                        {formatCents(o.platformFeeCents)}
                        {o.shipToBuyerCents
                          ? ` · ship ${formatCents(o.shipToBuyerCents)}`
                          : ""}
                      </p>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`text-xs font-bold ${STATUS_TONE[o.status] ?? "text-ink"}`}
                      >
                        {statusLabel(o.status)}
                      </span>
                      <p className="text-muted text-[10px] uppercase tracking-wide">
                        {o.status.replace(/_/g, " ")}
                      </p>
                      {isStuck && (
                        <span className="mt-1 inline-block rounded-full bg-red-100 text-[var(--tnt-red)] text-[10px] font-bold px-1.5 py-0.5">
                          STUCK
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Link
                          href={`/orders/${o.id}`}
                          className="tnt-btn tnt-btn--ghost !py-1 !px-2.5 !text-xs whitespace-nowrap"
                        >
                          View
                        </Link>
                        {ADMIN_CANCELLABLE.includes(o.status) && (
                          <CancelOrderButton
                            orderId={o.id}
                            shipped={o.status === "SHIPPED_TO_BUYER"}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Party({
  user,
  guestEmail,
  superadmin,
}: {
  user: { id: string; name: string; displayName: string | null; email: string } | null;
  guestEmail?: string | null;
  superadmin: boolean;
}) {
  if (!user) {
    return (
      <>
        <span className="text-ink font-medium">Guest</span>
        <p className="text-muted text-xs">{guestEmail ?? "no email"}</p>
      </>
    );
  }
  const name = displayNameOf(user);
  return (
    <>
      {superadmin ? (
        <Link
          href={`/admin/users/${user.id}`}
          className="!text-ink hover:!text-[var(--tnt-red)] font-medium"
        >
          {name}
        </Link>
      ) : (
        <span className="text-ink font-medium">{name}</span>
      )}
      <p className="text-muted text-xs">{user.email}</p>
    </>
  );
}

function query(where: Prisma.OrderWhereInput) {
  const party = { id: true, name: true, displayName: true, email: true } as const;
  return prisma.order.findMany({
    where,
    select: {
      id: true,
      status: true,
      itemCents: true,
      platformFeeCents: true,
      shipToBuyerCents: true,
      totalCents: true,
      guestEmail: true,
      createdAt: true,
      listing: { select: { id: true, title: true } },
      buyer: { select: party },
      seller: { select: party },
      shipmentEvents: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { carrier: true, trackingNumber: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });
}
