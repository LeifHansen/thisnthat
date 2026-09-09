import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin, isSuperadmin } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/fees";
import { statusLabel } from "@/lib/orderState";
import { AdminHeader } from "../../AdminHeader";
import { loadQueueCount } from "../../data";
import { UserRowActions } from "../UserRowActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "User detail · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireSuperadmin();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      listings: { orderBy: { createdAt: "desc" }, take: 50 },
      buyerOrders: {
        include: { listing: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 25,
      },
      sellerOrders: {
        include: { listing: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 25,
      },
      authRequests: { orderBy: { createdAt: "desc" }, take: 25 },
      registry: { orderBy: { issuedAt: "desc" }, take: 25 },
      offers: {
        include: { listing: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
        take: 15,
      },
      // True totals — the lists above are capped, so stats must not count them.
      _count: {
        select: {
          listings: true,
          buyerOrders: true,
          sellerOrders: true,
          authRequests: true,
          registry: true,
        },
      },
    },
  });
  if (!user) notFound();

  // Aggregate, not the capped sellerOrders list — the stat must count ALL
  // completed sales, not just the 25 most recent rows shown below.
  const [queueCount, gmvSold] = await Promise.all([
    loadQueueCount(),
    prisma.order.aggregate({
      where: { sellerId: id, status: "COMPLETED" },
      _sum: { itemCents: true },
    }),
  ]);
  const isSelf = user.email.toLowerCase() === admin.email?.toLowerCase();
  const orders = user._count.buyerOrders + user._count.sellerOrders;
  const deletable = !isSelf && user._count.listings === 0 && orders === 0;
  const gmvSoldCents = gmvSold._sum.itemCents ?? 0;

  return (
    <div className="space-y-6">
      <AdminHeader isSuperadmin queueCount={queueCount} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted text-xs">
            <Link href="/admin/users" className="!text-[var(--tnt-red)] font-semibold">
              ← All users
            </Link>
          </p>
          <h1 className="text-ink text-2xl flex items-center gap-2 flex-wrap">
            {user.name}
            <span
              className={`text-xs font-bold ${
                user.role === "ADMIN" ? "text-[var(--tnt-red)]" : "text-muted"
              }`}
            >
              {isSuperadmin(user) ? "SUPERADMIN" : user.role}
            </span>
            {user.suspended && (
              <span className="rounded-full bg-red-100 text-[var(--tnt-red)] text-[10px] font-bold px-1.5 py-0.5">
                SUSPENDED
              </span>
            )}
          </h1>
          <p className="text-muted text-sm">{user.email}</p>
        </div>
        <UserRowActions
          id={user.id}
          name={user.name}
          role={user.role}
          suspended={user.suspended}
          isSelf={isSelf}
          deletable={deletable}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat label="Listings" value={user._count.listings.toLocaleString()} />
        <Stat label="Purchases" value={user._count.buyerOrders.toLocaleString()} />
        <Stat label="Sales" value={user._count.sellerOrders.toLocaleString()} />
        <Stat label="Sold GMV" value={formatCents(gmvSoldCents)} accent />
        <Stat label="Auth requests" value={user._count.authRequests.toLocaleString()} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <section className="tnt-panel p-4 space-y-1 text-sm">
          <h2 className="text-ink font-bold mb-1">Account</h2>
          <Row l="Joined" v={user.createdAt.toISOString().slice(0, 10)} />
          <Row l="Last updated" v={user.updatedAt.toISOString().slice(0, 10)} />
          <Row
            l="Stripe payouts"
            v={user.stripeConnectId ? `Connected (${user.stripeConnectId.slice(0, 14)}…)` : "Not connected"}
          />
          <Row l="Registry entries" v={String(user._count.registry)} />
        </section>
        <section className="tnt-panel p-4 space-y-1 text-sm">
          <h2 className="text-ink font-bold mb-1">Address</h2>
          {user.addressLine1 ? (
            <>
              <p className="text-muted">{user.addressLine1}</p>
              {user.addressLine2 && <p className="text-muted">{user.addressLine2}</p>}
              <p className="text-muted">
                {user.city}, {user.state} {user.postalCode}
              </p>
              <p className="text-muted">{user.country}</p>
            </>
          ) : (
            <p className="text-muted">No address on file.</p>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-ink text-lg">
          Listings
          {user._count.listings > user.listings.length && (
            <span className="text-muted text-sm font-normal">
              {" "}
              · latest {user.listings.length} of {user._count.listings}
            </span>
          )}
        </h2>
        {user.listings.length === 0 ? (
          <p className="text-muted text-sm">None.</p>
        ) : (
          <div className="tnt-panel divide-y divide-[var(--tnt-line)]">
            {user.listings.map((l) => (
              <div
                key={l.id}
                className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap text-sm"
              >
                <Link href={`/listings/${l.id}`} className="!text-ink font-medium min-w-0 truncate">
                  {l.title}
                </Link>
                <span className="text-muted whitespace-nowrap">
                  {formatCents(l.priceCents)} ·{" "}
                  <StatusBadge status={l.status} /> ·{" "}
                  {l.createdAt.toISOString().slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <OrderSection title="Purchases" orders={user.buyerOrders} />
        <OrderSection title="Sales" orders={user.sellerOrders} />
      </div>

      <section className="space-y-2">
        <h2 className="text-ink text-lg">Authentication requests</h2>
        {user.authRequests.length === 0 ? (
          <p className="text-muted text-sm">None.</p>
        ) : (
          <div className="tnt-panel divide-y divide-[var(--tnt-line)]">
            {user.authRequests.map((r) => (
              <div
                key={r.id}
                className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap text-sm"
              >
                <Link href={`/authenticate/${r.id}`} className="!text-ink font-medium">
                  {r.beanieName}
                </Link>
                <span className="text-muted whitespace-nowrap">
                  {formatCents(r.totalCents)} · {r.status.replace(/_/g, " ")}
                  {r.registrationNumber ? ` · #${r.registrationNumber}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {user.offers.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-ink text-lg">Recent offers made</h2>
          <div className="tnt-panel divide-y divide-[var(--tnt-line)]">
            {user.offers.map((o) => (
              <div
                key={o.id}
                className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap text-sm"
              >
                <Link href={`/listings/${o.listing.id}`} className="!text-ink font-medium min-w-0 truncate">
                  {o.listing.title}
                </Link>
                <span className="text-muted whitespace-nowrap">
                  {formatCents(o.priceCents)} · {o.status.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="tnt-panel p-3">
      <p className="text-muted text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${accent ? "text-[var(--tnt-red)]" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{l}</span>
      <span className="text-ink text-right">{v}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "ACTIVE"
      ? "text-[var(--tnt-green)]"
      : status === "SOLD"
        ? "text-[var(--tnt-red)]"
        : "text-muted";
  return <span className={`font-semibold ${color}`}>{status}</span>;
}

function OrderSection({
  title,
  orders,
}: {
  title: string;
  orders: {
    id: string;
    status: string;
    totalCents: number;
    createdAt: Date;
    listing: { title: string };
  }[];
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-ink text-lg">{title}</h2>
      {orders.length === 0 ? (
        <p className="text-muted text-sm">None.</p>
      ) : (
        <div className="tnt-panel divide-y divide-[var(--tnt-line)]">
          {orders.map((o) => (
            <div
              key={o.id}
              className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap text-sm"
            >
              <Link href={`/orders/${o.id}`} className="!text-ink font-medium min-w-0 truncate">
                {o.listing.title}
              </Link>
              <span className="text-muted whitespace-nowrap">
                {formatCents(o.totalCents)} · {statusLabel(o.status as never)} ·{" "}
                {o.createdAt.toISOString().slice(0, 10)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
