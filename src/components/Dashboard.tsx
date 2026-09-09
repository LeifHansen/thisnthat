import Link from "next/link";
import Image from "next/image";
import type { ListingStatus, OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/fees";
import { statusLabel } from "@/lib/orderState";
import { ConnectButton } from "@/components/ConnectButton";
import { ConditionBadge } from "@/components/ConditionBadge";
import { getPayoutState } from "@/lib/payout";
import { CoinIcon } from "@/components/BrandIcons";
import { Avatar } from "@/components/Avatar";
import { FollowButton } from "@/components/FollowButton";
import { ListingCard } from "@/components/ListingCard";
import { displayNameOf } from "@/lib/users";
import {
  acceptOffer,
  rejectOffer,
  dismissOffer,
  expireStaleOffers,
} from "@/lib/offers";
import { deleteListing } from "@/lib/actions";
import { RemovableRow } from "@/components/RemovableRow";
import { FormSubmitButton } from "@/components/FormSubmitButton";

export async function Dashboard({
  userId,
  connected,
}: {
  userId: string;
  /** The `connected` marker Stripe's return_url carries back. */
  connected?: string;
}) {
  // Lazy: roll forward any pending offers that crossed their expiry so they
  // don't appear in the seller's queue as actionable.
  await expireStaleOffers();

  // Lists are capped (the dashboard is a workspace, not an archive) and the
  // at-a-glance tiles read true totals from count queries so a power seller's
  // stats stay exact past the caps.
  const OPEN_EXCLUDED = ["COMPLETED", "CANCELLED", "REFUNDED"] as const;
  const [
    me,
    listings,
    buying,
    selling,
    offersReceived,
    offersSent,
    likedListings,
    following,
    needsShipCount,
    openSalesCount,
    openPurchasesCount,
    activeListingsCount,
    sellingCount,
    buyingCount,
    listingsCount,
  ] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.listing.findMany({
        // REMOVED = seller-deleted; hidden from the manager (records kept).
        where: { sellerId: userId, status: { not: "REMOVED" } },
        include: { category: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 60,
      }),
      prisma.order.findMany({
        where: { buyerId: userId },
        include: {
          listing: { select: { title: true } },
          // Whether the buyer has already reviewed a completed purchase.
          review: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.order.findMany({
        where: { sellerId: userId },
        include: { listing: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      // Pending offers on MY listings (seller-side queue).
      prisma.offer.findMany({
        where: {
          status: "PENDING",
          listing: { sellerId: userId },
        },
        include: {
          listing: { select: { id: true, title: true, priceCents: true } },
          buyer: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      // Offers I (the buyer) have outstanding or recently decided, minus the
      // finished ones I've cleared off this list.
      prisma.offer.findMany({
        where: { buyerId: userId, dismissedAt: null },
        include: {
          listing: { select: { id: true, title: true, priceCents: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      // Listings this user has ♥'d (newest like first).
      prisma.listingLike.findMany({
        where: { userId },
        include: { listing: true },
        orderBy: { createdAt: "desc" },
        take: 24,
      }),
      // Stores this user follows.
      prisma.follow.findMany({
        where: { followerId: userId },
        include: {
          followed: {
            select: {
              id: true,
              name: true,
              displayName: true,
              avatarUrl: true,
              suspended: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.order.count({
        where: {
          sellerId: userId,
          status: { in: ["AWAITING_SHIP_TO_BUYER", "PAID_ESCROW"] },
        },
      }),
      prisma.order.count({
        where: { sellerId: userId, status: { notIn: [...OPEN_EXCLUDED] } },
      }),
      prisma.order.count({
        where: { buyerId: userId, status: { notIn: [...OPEN_EXCLUDED] } },
      }),
      prisma.listing.count({ where: { sellerId: userId, status: "ACTIVE" } }),
      prisma.order.count({ where: { sellerId: userId } }),
      prisma.order.count({ where: { buyerId: userId } }),
      prisma.listing.count({
        where: { sellerId: userId, status: { not: "REMOVED" } },
      }),
    ]);

  // Real Stripe onboarding state (not just "an account exists") for the card.
  const payout = await getPayoutState(me);

  return (
    <div className="space-y-10">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Avatar
            src={me?.avatarUrl}
            name={me ? displayNameOf(me) : "?"}
            size={52}
          />
          <div>
            <h1 className="text-3xl">Your account</h1>
            <p className="text-muted">
              {me ? displayNameOf(me) : "Welcome back"}
            </p>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/sell" className="tnt-btn">
            Sell an item
          </Link>
          <Link href="/dashboard/profile" className="tnt-btn tnt-btn--ghost">
            Edit Profile
          </Link>
          <Link href="/browse" className="tnt-btn tnt-btn--ghost">
            Browse
          </Link>
          <Link href="/messages" className="tnt-btn tnt-btn--ghost">
            Messages
          </Link>
        </div>
      </div>

      {/* ── First-listing hero: unmissable until the first listing exists ── */}
      {listingsCount === 0 && (
        <section
          className="tnt-panel p-5 sm:p-6 flex items-center justify-between gap-4 flex-wrap"
          style={{
            background: "var(--tnt-green-soft)",
            borderColor: "var(--tnt-green)",
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-4xl" aria-hidden="true">
              🏷️
            </span>
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold">List your first item</h2>
              <p className="text-muted text-sm">
                It takes a couple of minutes — add photos, describe the item,
                set your price. Your payment is protected on every sale.
              </p>
            </div>
          </div>
          <Link href="/sell" className="tnt-btn shrink-0">
            Start listing →
          </Link>
        </section>
      )}

      {/* ── At-a-glance tiles: orders needing action lead the row ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(() => {
          const tiles = [
            {
              label: "Orders to ship",
              value: needsShipCount,
              sub: needsShipCount > 0 ? "Buyers are waiting!" : "All caught up",
              href: "#sales",
              accent: needsShipCount > 0 ? "var(--tnt-red)" : "var(--tnt-green)",
            },
            {
              label: "Open sales",
              value: openSalesCount,
              sub: `${sellingCount} all-time`,
              href: "#sales",
              accent: "var(--tnt-blue)",
            },
            {
              label: "Open purchases",
              value: openPurchasesCount,
              sub: `${buyingCount} all-time`,
              href: "#purchases",
              accent: "var(--tnt-purple)",
            },
            {
              label: "Active listings",
              value: activeListingsCount,
              sub: `${listingsCount} total`,
              href: "#listings",
              accent: "var(--tnt-green)",
            },
          ];
          return tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="tnt-panel p-4 space-y-0.5 !text-ink hover:shadow-[var(--tnt-shadow-lg)] transition-shadow border-t-4"
              style={{ borderTopColor: t.accent }}
            >
              <p className="text-3xl font-extrabold leading-none">{t.value}</p>
              <p className="text-sm font-bold">{t.label}</p>
              <p className="text-xs text-muted">{t.sub}</p>
            </Link>
          ));
        })()}
      </section>

      <section id="payouts" className="tnt-panel p-5 space-y-2 scroll-mt-24">
        <h2 className="text-lg flex items-center gap-2">
          <CoinIcon className="h-6 w-6" />
          Seller payouts
        </h2>

        {/* Coming back from Stripe used to look identical to never having left:
            return_url set ?connected=1 and nothing read it. Acknowledge the
            return, and let the live status below say where it actually got to. */}
        {connected && (
          <p
            className="rounded-lg border px-3 py-2 text-sm font-semibold text-ink"
            style={
              connected === "refresh_failed"
                ? {
                    background: "var(--tnt-red-soft)",
                    borderColor: "var(--tnt-red)",
                  }
                : {
                    background: "var(--tnt-green-soft)",
                    borderColor: "var(--tnt-green)",
                  }
            }
          >
            {connected === "refresh_failed"
              ? "We couldn't reopen Stripe payout setup. Try the button below."
              : payout.status === "enabled"
                ? "You're all set — payouts are live on your account. 🎉"
                : payout.status === "pending"
                  ? "Thanks — Stripe has your details and is verifying them now."
                  : "Welcome back. Stripe still needs a little more before payouts can go live."}
          </p>
        )}

        <p className="text-muted text-sm">
          {payout.status === "enabled"
            ? "Payout account connected. Each sale is paid out here once the item is delivered or the buyer confirms receipt."
            : payout.status === "pending"
              ? "You've finished your side of setup — Stripe is verifying your details. This usually takes a few minutes, and nothing more is needed from you. Sales will pay out here once it clears."
              : payout.status === "incomplete"
                ? "Your payout account needs a few more details before you can receive funds. Finish setup to start getting paid."
                : "Set up seller payouts to receive funds from your sales. Buyers pay the platform; you're paid by transfer once each item is delivered."}
        </p>

        {/* Naming what Stripe is waiting on turns "a few more details" into
            something the seller can actually act on. */}
        {payout.currentlyDue.length > 0 && (
          <p className="text-muted text-xs">
            Still needed: {payout.currentlyDue.map(requirementLabel).join(", ")}.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <ConnectButton status={payout.status} />
          <Link
            href="/dashboard/payouts"
            className="text-sm font-semibold !text-[var(--tnt-red)]"
          >
            Held &amp; released balances, transfer history →
          </Link>
        </div>
      </section>

      {(offersReceived.length > 0 || offersSent.length > 0) && (
        <section id="offers" className="space-y-3 scroll-mt-24">
          <h2 className="text-lg">Offers</h2>

          {offersReceived.length > 0 && (
            <div className="space-y-2">
              <p className="text-muted text-sm font-semibold">
                Pending offers on your listings
              </p>
              {offersReceived.map((o) => {
                const pctOfAsk = Math.round(
                  (o.priceCents / o.listing.priceCents) * 100,
                );
                return (
                  <div key={o.id} className="tnt-panel p-4 space-y-3">
                    <div className="flex justify-between items-baseline gap-3 flex-wrap">
                      <Link
                        href={`/listings/${o.listing.id}`}
                        className="!text-ink font-medium"
                      >
                        {o.listing.title}
                      </Link>
                      <span className="text-sm">
                        <b className="text-[var(--tnt-red)]">
                          {formatCents(o.priceCents)}
                        </b>{" "}
                        <span className="text-muted">
                          / ask {formatCents(o.listing.priceCents)} ({pctOfAsk}
                          %)
                        </span>
                      </span>
                    </div>
                    <p className="text-muted text-sm">
                      From {o.buyer.name} ·{" "}
                      {o.createdAt.toISOString().slice(0, 10)} · expires{" "}
                      {o.expiresAt.toISOString().slice(0, 10)}
                    </p>
                    {o.message && (
                      <p className="text-sm whitespace-pre-wrap bg-[var(--tnt-surface)] p-2 rounded border border-[var(--tnt-line)]">
                        “{o.message}”
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <form action={acceptOffer}>
                        <input type="hidden" name="offerId" value={o.id} />
                        <FormSubmitButton pendingLabel="Accepting…">
                          Accept — create order at {formatCents(o.priceCents)}
                        </FormSubmitButton>
                      </form>
                      <form action={rejectOffer}>
                        <input type="hidden" name="offerId" value={o.id} />
                        <FormSubmitButton
                          className="tnt-btn tnt-btn--ghost"
                          pendingLabel="Rejecting…"
                        >
                          Reject
                        </FormSubmitButton>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {offersSent.length > 0 && (
            <div className="space-y-2">
              <p className="text-muted text-sm font-semibold">Offers I&apos;ve sent</p>
              {offersSent.map((o) => {
                // Done with, and never turned into an order: nothing left to
                // act on, so let the buyer clear the row away.
                const clearable = o.status !== "PENDING" && !o.orderId;
                const rowClass =
                  "tnt-panel px-4 py-3 flex justify-between items-center !text-ink hover:border-[var(--tnt-line-strong)] flex-wrap gap-2";
                const statusLabel = o.status.replace(/_/g, " ");
                const content = (
                  <>
                    <Link
                      href={
                        o.orderId
                          ? `/orders/${o.orderId}`
                          : `/listings/${o.listing.id}`
                      }
                      className="flex-1 min-w-0 truncate !text-ink hover:opacity-80"
                    >
                      {o.listing.title}
                      <span className="text-muted text-sm">
                        {" "}
                        · {formatCents(o.priceCents)}
                      </span>
                    </Link>
                    <span className="text-sm font-semibold">
                      <span
                        className={
                          o.status === "ACCEPTED" || o.status === "AUTO_ACCEPTED"
                            ? "text-[var(--tnt-green)]"
                            : o.status === "REJECTED"
                              ? "text-pink"
                              : "text-muted"
                        }
                      >
                        {statusLabel}
                      </span>
                      {o.orderId &&
                        (o.status === "ACCEPTED" ||
                          o.status === "AUTO_ACCEPTED") && (
                          <span className="text-[var(--tnt-green)]">
                            {" "}
                            · Pay now →
                          </span>
                        )}
                    </span>
                  </>
                );
                return clearable ? (
                  <RemovableRow
                    key={o.id}
                    action={dismissOffer}
                    fieldName="offerId"
                    fieldValue={o.id}
                    confirmMessage={`Clear this ${statusLabel.toLowerCase()} offer on "${o.listing.title}"? It just leaves your dashboard — the listing isn't affected.`}
                    ariaLabel={`Clear ${statusLabel.toLowerCase()} offer on ${o.listing.title}`}
                    errorFallback="Couldn't clear this offer."
                    className={rowClass}
                  >
                    {content}
                  </RemovableRow>
                ) : (
                  <div key={o.id} className={rowClass}>
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section id="listings" className="space-y-3 scroll-mt-24">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">My listings</h2>
          <Link
            href="/sell"
            className="text-sm !text-[var(--tnt-green)] font-semibold"
          >
            + List an item
          </Link>
        </div>
        {listings.length === 0 ? (
          <p className="text-muted">
            None yet —{" "}
            <Link href="/sell" className="!text-[var(--tnt-green)]">
              list your first item
            </Link>
            .
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {listings.map((l) => (
              <RemovableRow
                key={l.id}
                action={deleteListing}
                fieldName="listingId"
                fieldValue={l.id}
                confirmMessage={`Delete "${l.title}"? It will be removed from your store and Browse. This can't be undone from here.`}
                ariaLabel={`Delete ${l.title}`}
                errorFallback="Couldn't delete this listing."
                className="tnt-panel p-2 flex items-center gap-3 !text-ink"
              >
                <Link
                  href={`/listings/${l.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0 !text-ink hover:opacity-80"
                >
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[var(--tnt-line)] bg-[var(--tnt-surface)]">
                    {l.photos[0] ? (
                      <Image
                        src={l.photos[0]}
                        alt={l.title}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[9px] text-muted">
                        no photo
                      </span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0 space-y-0.5">
                    <span className="block truncate">{l.title}</span>
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <ConditionBadge condition={l.condition} />
                      <span className="text-muted text-xs truncate">
                        {l.category.name}
                        {l.isLot ? " · Lot" : ""}
                      </span>
                    </span>
                  </span>
                </Link>
                <span className="text-sm font-semibold whitespace-nowrap">
                  {formatCents(l.priceCents)} ·{" "}
                  <span className="text-muted font-normal">
                    {listingStatusLabel(l.status)}
                  </span>
                </span>
                {l.status !== "SOLD" && (
                  <Link
                    href={`/listings/${l.id}/edit`}
                    className="shrink-0 rounded-full border-2 border-[var(--tnt-ink)] bg-white !text-ink px-3 py-1 text-xs font-bold shadow-[0_2px_0_var(--tnt-ink)] hover:-translate-y-0.5 transition-transform"
                  >
                    Edit
                  </Link>
                )}
              </RemovableRow>
            ))}
          </div>
        )}
      </section>

      <section id="liked" className="space-y-3 scroll-mt-24">
        <h2 className="text-lg">Liked listings</h2>
        {likedListings.length === 0 ? (
          <p className="text-muted">
            Nothing liked yet — tap the ♡ on any{" "}
            <Link href="/browse" className="!text-[var(--tnt-green)]">
              listing
            </Link>{" "}
            to save it here.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {likedListings.map((like) => (
              <ListingCard key={like.id} listing={like.listing} />
            ))}
          </div>
        )}
      </section>

      <section id="following" className="space-y-3 scroll-mt-24">
        <h2 className="text-lg">Following</h2>
        {following.length === 0 ? (
          <p className="text-muted">
            Not following any stores yet — visit a seller&apos;s profile and
            tap Follow to keep up with their listings.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {following
              .filter((f) => !f.followed.suspended)
              .map((f) => (
                <div
                  key={f.id}
                  className="tnt-panel p-2 flex items-center gap-3 !text-ink"
                >
                  <Link
                    href={`/u/${f.followed.id}`}
                    className="flex items-center gap-3 flex-1 min-w-0 !text-ink hover:opacity-80"
                  >
                    <Avatar
                      src={f.followed.avatarUrl}
                      name={displayNameOf(f.followed)}
                      size={40}
                    />
                    <span className="flex-1 min-w-0 truncate font-semibold">
                      {displayNameOf(f.followed)}
                    </span>
                  </Link>
                  <FollowButton
                    userId={f.followed.id}
                    isFollowing
                    signedIn
                    size="sm"
                  />
                </div>
              ))}
          </div>
        )}
      </section>

      <section id="purchases" className="space-y-3 scroll-mt-24">
        <h2 className="text-lg">Purchases</h2>
        <OrderList orders={buying} empty="No purchases yet." role="buyer" />
        {buyingCount > buying.length && (
          <p className="text-muted text-xs">
            Showing your {buying.length} most recent of {buyingCount} purchases.
          </p>
        )}
      </section>

      <section id="sales" className="space-y-3 scroll-mt-24">
        <h2 className="text-lg">Sales</h2>
        <OrderList orders={selling} empty="No sales yet." role="seller" />
        {sellingCount > selling.length && (
          <p className="text-muted text-xs">
            Showing your {selling.length} most recent of {sellingCount} sales.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * Stripe reports outstanding requirements as dotted API paths
 * ("individual.verification.document", "external_account"). Show the seller
 * something they can recognise, and fall back to a de-dotted version of the key
 * rather than hiding a requirement this list hasn't seen yet.
 */
function requirementLabel(key: string): string {
  const known: Record<string, string> = {
    external_account: "a bank account for payouts",
    "individual.verification.document": "a photo ID",
    "individual.verification.additional_document": "a proof of address",
    "individual.id_number": "your ID or SSN number",
    "individual.dob.day": "your date of birth",
    "individual.address.line1": "your address",
    "business_profile.url": "a business website or product description",
    "business_profile.mcc": "your business category",
    "tos_acceptance.date": "accepting Stripe's terms",
  };
  return known[key] ?? key.split(".").pop()!.replace(/_/g, " ");
}

const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  SOLD: "Sold",
  REMOVED: "Removed",
};

function listingStatusLabel(status: ListingStatus): string {
  return LISTING_STATUS_LABEL[status] ?? status;
}

/**
 * What the viewer should do next on an order, if anything. The forms
 * themselves live on the order page (mark-shipped needs carrier + tracking;
 * confirm-receipt pays the seller), so the row just names the step and links
 * through.
 */
function nextStep(
  role: "buyer" | "seller",
  status: OrderStatus,
  reviewed: boolean,
): string | null {
  if (role === "seller") {
    return status === "AWAITING_SHIP_TO_BUYER" ? "Mark shipped →" : null;
  }
  if (status === "PENDING_PAYMENT") return "Pay now →";
  if (status === "SHIPPED_TO_BUYER") return "Confirm receipt →";
  if (status === "COMPLETED" && !reviewed) return "Leave a review →";
  return null;
}

function OrderList({
  orders,
  empty,
  role,
}: {
  orders: {
    id: string;
    status: OrderStatus;
    itemCents: number;
    platformFeeCents: number;
    totalCents: number;
    listing: { title: string };
    review?: { id: string } | null;
  }[];
  empty: string;
  /** Sales list: show the seller's net payout (item − fee) instead of the
   *  buyer's total, and seller-side next steps. */
  role: "buyer" | "seller";
}) {
  if (orders.length === 0) return <p className="text-muted">{empty}</p>;
  const showProceeds = role === "seller";
  return (
    <div className="space-y-2">
      {orders.map((o) => {
        const amount = showProceeds
          ? o.itemCents - o.platformFeeCents
          : o.totalCents;
        const step = nextStep(role, o.status, !!o.review);
        return (
          <Link
            key={o.id}
            href={`/orders/${o.id}`}
            className="tnt-panel px-4 py-3 flex justify-between items-center gap-3 flex-wrap !text-ink hover:border-[var(--tnt-line-strong)]"
          >
            <span className="flex-1 min-w-0 truncate">{o.listing.title}</span>
            <span className="text-sm font-semibold whitespace-nowrap">
              {formatCents(amount)}
              {showProceeds && (
                <span className="text-muted font-normal"> payout</span>
              )}{" "}
              ·{" "}
              <span className="text-muted font-normal">
                {statusLabel(o.status)}
              </span>
              {step && (
                <span className="text-[var(--tnt-green)]"> · {step}</span>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
