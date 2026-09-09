import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { requireSuperadmin, isSuperadmin } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/fees";
import { statusLabel } from "@/lib/orderState";
import { displayNameOf } from "@/lib/users";
import { ConditionBadge } from "@/components/ConditionBadge";
import { AdminHeader } from "../../AdminHeader";
import { loadQueueCount } from "../../data";
import { UserRowActions } from "../UserRowActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "User detail · Admin",
  robots: { index: false, follow: false },
};

const REVIEWS_SHOWN = 15;

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
      listings: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { category: { select: { name: true } } },
      },
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
      offers: {
        include: { listing: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
        take: 15,
      },
      // Reviews this account left as a buyer.
      productReviews: {
        include: { listing: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
        take: REVIEWS_SHOWN,
      },
      // True totals — the lists above are capped, so stats must not count them.
      _count: {
        select: {
          listings: true,
          buyerOrders: true,
          sellerOrders: true,
          offers: true,
          productReviews: true,
          sentMessages: true,
          followers: true,
          following: true,
        },
      },
    },
  });
  if (!user) notFound();

  // Aggregates, not the capped lists — the stats must count ALL completed
  // sales and ALL reviews received, not just the most recent rows shown.
  // Reviews received hang off the denormalized sellerId (no relation), so
  // they're a separate query.
  const [ordersCount, gmvSold, reviewsReceived, ratingAgg] = await Promise.all([
    loadQueueCount(),
    prisma.order.aggregate({
      where: { sellerId: id, status: "COMPLETED" },
      _sum: { itemCents: true },
    }),
    prisma.productReview.findMany({
      where: { sellerId: id },
      include: {
        buyer: { select: { id: true, name: true, displayName: true } },
        listing: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: REVIEWS_SHOWN,
    }),
    prisma.productReview.aggregate({
      where: { sellerId: id },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);
  const isSelf = user.email.toLowerCase() === admin.email?.toLowerCase();
  const orders = user._count.buyerOrders + user._count.sellerOrders;
  // Mirrors the refusal in deleteUser.
  const deletable =
    !isSelf &&
    user._count.listings === 0 &&
    orders === 0 &&
    user._count.offers === 0 &&
    user._count.productReviews === 0 &&
    user._count.sentMessages === 0;
  const gmvSoldCents = gmvSold._sum.itemCents ?? 0;
  const reviewCount = ratingAgg._count._all;
  const avgRating = ratingAgg._avg.rating;

  const connect = user.stripePayoutsEnabledAt
    ? `Payouts live since ${user.stripePayoutsEnabledAt.toISOString().slice(0, 10)}`
    : user.stripeConnectStartedAt
      ? `Started ${user.stripeConnectStartedAt.toISOString().slice(0, 10)} — not finished`
      : user.stripeConnectId
        ? "Started — not finished"
        : "Not started";

  return (
    <div className="space-y-6">
      <AdminHeader isSuperadmin ordersCount={ordersCount} />

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
            {user.deletedAt ? (
              <span className="rounded-full bg-black/10 text-muted text-[10px] font-bold px-1.5 py-0.5">
                DELETED {user.deletedAt.toISOString().slice(0, 10)}
              </span>
            ) : (
              user.suspended && (
                <span className="rounded-full bg-red-100 text-[var(--tnt-red)] text-[10px] font-bold px-1.5 py-0.5">
                  SUSPENDED
                </span>
              )
            )}
          </h1>
          <p className="text-muted text-sm">
            {user.email}
            {user.displayName && user.displayName !== user.name
              ? ` · shown as “${user.displayName}”`
              : ""}
          </p>
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Listings" value={user._count.listings.toLocaleString()} />
        <Stat label="Purchases" value={user._count.buyerOrders.toLocaleString()} />
        <Stat label="Sales" value={user._count.sellerOrders.toLocaleString()} />
        <Stat label="Sold GMV" value={formatCents(gmvSoldCents)} accent />
        <Stat label="Offers made" value={user._count.offers.toLocaleString()} />
        <Stat
          label="Seller rating"
          value={
            avgRating != null
              ? `${avgRating.toFixed(1)} ★`
              : "—"
          }
          sub={`${reviewCount.toLocaleString()} review${reviewCount === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <section className="tnt-panel p-4 space-y-1 text-sm">
          <h2 className="text-ink font-bold mb-1">Account</h2>
          <Row l="Joined" v={user.createdAt.toISOString().slice(0, 10)} />
          <Row l="Last updated" v={user.updatedAt.toISOString().slice(0, 10)} />
          <Row l="Stripe Connect" v={connect} />
          {user.stripeConnectId && (
            <Row l="Connect account" v={`${user.stripeConnectId.slice(0, 14)}…`} />
          )}
          <Row l="Ship-from ZIP" v={user.shipFromPostalCode ?? "—"} />
          <Row
            l="Followers / following"
            v={`${user._count.followers} / ${user._count.following}`}
          />
          <Row l="Messages sent" v={user._count.sentMessages.toLocaleString()} />
          <Row l="Reviews left" v={user._count.productReviews.toLocaleString()} />
          {user.bio && (
            <p className="text-muted pt-1 whitespace-pre-line">{user.bio}</p>
          )}
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
                <span className="flex items-center gap-2 min-w-0">
                  <Link href={`/listings/${l.id}`} className="!text-ink font-medium min-w-0 truncate">
                    {l.title}
                  </Link>
                  <span className="text-muted text-xs whitespace-nowrap">
                    {l.category.name}
                  </span>
                  <ConditionBadge condition={l.condition} />
                </span>
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
        <h2 className="text-ink text-lg">Recent offers made</h2>
        {user.offers.length === 0 ? (
          <p className="text-muted text-sm">None.</p>
        ) : (
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
                  {formatCents(o.priceCents)} · {o.status.replace(/_/g, " ")} ·{" "}
                  {o.createdAt.toISOString().slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="space-y-2">
          <h2 className="text-ink text-lg">
            Reviews received
            {reviewCount > reviewsReceived.length && (
              <span className="text-muted text-sm font-normal">
                {" "}
                · latest {reviewsReceived.length} of {reviewCount}
              </span>
            )}
          </h2>
          {reviewsReceived.length === 0 ? (
            <p className="text-muted text-sm">None.</p>
          ) : (
            <div className="tnt-panel divide-y divide-[var(--tnt-line)]">
              {reviewsReceived.map((r) => (
                <ReviewRow
                  key={r.id}
                  rating={r.rating}
                  body={r.body}
                  createdAt={r.createdAt}
                  listing={r.listing}
                  by={
                    <Link href={`/admin/users/${r.buyer.id}`} className="!text-ink font-medium">
                      {displayNameOf(r.buyer)}
                    </Link>
                  }
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-ink text-lg">
            Reviews given
            {user._count.productReviews > user.productReviews.length && (
              <span className="text-muted text-sm font-normal">
                {" "}
                · latest {user.productReviews.length} of {user._count.productReviews}
              </span>
            )}
          </h2>
          {user.productReviews.length === 0 ? (
            <p className="text-muted text-sm">None.</p>
          ) : (
            <div className="tnt-panel divide-y divide-[var(--tnt-line)]">
              {user.productReviews.map((r) => (
                <ReviewRow
                  key={r.id}
                  rating={r.rating}
                  body={r.body}
                  createdAt={r.createdAt}
                  listing={r.listing}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="tnt-panel p-3">
      <p className="text-muted text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${accent ? "text-[var(--tnt-red)]" : "text-ink"}`}>
        {value}
      </p>
      {sub && <p className="text-muted text-xs">{sub}</p>}
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

function ReviewRow({
  rating,
  body,
  createdAt,
  listing,
  by,
}: {
  rating: number;
  body: string | null;
  createdAt: Date;
  listing: { id: string; title: string };
  by?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-2.5 text-sm space-y-0.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[var(--tnt-red)] font-bold whitespace-nowrap">
            {"★".repeat(rating)}
            <span className="text-muted font-normal">{"★".repeat(5 - rating)}</span>
          </span>
          <Link href={`/listings/${listing.id}`} className="!text-ink font-medium min-w-0 truncate">
            {listing.title}
          </Link>
        </span>
        <span className="text-muted whitespace-nowrap text-xs">
          {by ? <>by {by} · </> : null}
          {createdAt.toISOString().slice(0, 10)}
        </span>
      </div>
      {body && <p className="text-muted whitespace-pre-line">{body}</p>}
    </div>
  );
}

function OrderSection({
  title,
  orders,
}: {
  title: string;
  orders: {
    id: string;
    status: OrderStatus;
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
                {formatCents(o.totalCents)} · {statusLabel(o.status)} ·{" "}
                {o.createdAt.toISOString().slice(0, 10)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
