import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { formatCents, authServiceLabel } from "@/lib/fees";
import { statusLabel } from "@/lib/orderState";
import { ConnectButton } from "@/components/ConnectButton";
import { getPayoutState } from "@/lib/payout";
import { reconcileStuckAuthRequests } from "@/lib/authPayment";
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
    authReqsFetched,
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
        orderBy: { createdAt: "desc" },
        take: 60,
      }),
      prisma.order.findMany({
        where: { buyerId: userId },
        include: { listing: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.order.findMany({
        where: { sellerId: userId },
        include: { listing: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.authenticationRequest.findMany({
        where: { userId },
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

  // A paid authentication whose webhook never landed shows here stuck at
  // REQUESTED ("payment not completed") even though the charge succeeded.
  // Reconcile just those rows against Stripe so the list reflects reality —
  // no Stripe calls in the common case of nothing stuck.
  let authReqs = authReqsFetched;
  const stuckIds = authReqs
    .filter(
      (r) =>
        (r.status === "REQUESTED" || r.status === "PAID") &&
        r.stripePaymentIntentId,
    )
    .map((r) => r.id);
  if (stuckIds.length > 0) {
    const advanced = await reconcileStuckAuthRequests({
      id: { in: stuckIds },
    });
    if (advanced > 0) {
      authReqs = await prisma.authenticationRequest.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
    }
  }

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
          <Link href={listingsCount === 0 ? "/sell/first" : "/sell"} className="bx-btn">
            Sell a Beanie
          </Link>
          <Link href="/dashboard/profile" className="bx-btn bx-btn--ghost">
            Edit Profile
          </Link>
          <Link href="/browse" className="bx-btn bx-btn--ghost">
            Browse
          </Link>
          <Link href="/messages" className="bx-btn bx-btn--ghost">
            Messages
          </Link>
        </div>
      </div>

      {/* ── First-listing hero: unmissable until the first listing exists ── */}
      {listingsCount === 0 && (
        <section
          className="bx-panel p-5 sm:p-6 flex items-center justify-between gap-4 flex-wrap"
          style={{
            background: "var(--bx-green-soft)",
            borderColor: "var(--bx-green)",
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-4xl" aria-hidden="true">
              🧸
            </span>
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold">Add your first listing</h2>
              <p className="text-muted text-sm">
                A guided wizard walks you through it in about two minutes —
                photos in, AI drafts the rest, you set the price.
              </p>
            </div>
          </div>
          <Link href="/sell/first" className="bx-btn shrink-0">
            Start the wizard →
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
              accent: needsShipCount > 0 ? "var(--bx-red)" : "var(--bx-green)",
            },
            {
              label: "Open sales",
              value: openSalesCount,
              sub: `${sellingCount} all-time`,
              href: "#sales",
              accent: "var(--bx-blue)",
            },
            {
              label: "Open purchases",
              value: openPurchasesCount,
              sub: `${buyingCount} all-time`,
              href: "#purchases",
              accent: "var(--bx-purple)",
            },
            {
              label: "Active listings",
              value: activeListingsCount,
              sub: `${listingsCount} total`,
              href: "#listings",
              accent: "var(--bx-green)",
            },
          ];
          return tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="bx-panel p-4 space-y-0.5 !text-ink hover:shadow-[var(--bx-shadow-lg)] transition-shadow border-t-4"
              style={{ borderTopColor: t.accent }}
            >
              <p className="text-3xl font-extrabold leading-none">{t.value}</p>
              <p className="text-sm font-bold">{t.label}</p>
              <p className="text-xs text-muted">{t.sub}</p>
            </Link>
          ));
        })()}
      </section>

      <section id="payouts" className="bx-panel p-5 space-y-2 scroll-mt-24">
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
                    background: "var(--bx-red-soft)",
                    borderColor: "var(--bx-red)",
                  }
                : {
                    background: "var(--bx-green-soft)",
                    borderColor: "var(--bx-green)",
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
            ? "Payout account connected. Escrow releases here when the buyer confirms receipt."
            : payout.status === "pending"
              ? "You've finished your side of setup — Stripe is verifying your details. This usually takes a few minutes, and nothing more is needed from you. Escrow will release here once it clears."
              : payout.status === "incomplete"
                ? "Your payout account needs a few more details before you can receive funds. Finish setup to start getting paid."
                : "Connect a Stripe payout account to receive funds from your sales."}
        </p>

        {/* Naming what Stripe is waiting on turns "a few more details" into
            something the seller can actually act on. */}
        {payout.currentlyDue.length > 0 && (
          <p className="text-muted text-xs">
            Still needed: {payout.currentlyDue.map(requirementLabel).join(", ")}.
          </p>
        )}

        <ConnectButton status={payout.status} />
      </section>

      {(offersReceived.length > 0 || offersSent.length > 0) && (
        <section className="space-y-3">
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
                  <div key={o.id} className="bx-panel p-4 space-y-3">
                    <div className="flex justify-between items-baseline gap-3 flex-wrap">
                      <Link
                        href={`/listings/${o.listing.id}`}
                        className="!text-ink font-medium"
                      >
                        {o.listing.title}
                      </Link>
                      <span className="text-sm">
                        <b className="text-[var(--bx-red)]">
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
                      <p className="text-sm whitespace-pre-wrap bg-[var(--bx-surface)] p-2 rounded border border-[var(--bx-line)]">
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
                          className="bx-btn bx-btn--ghost"
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
                  "bx-panel px-4 py-3 flex justify-between items-center !text-ink hover:border-[var(--bx-line-strong)] flex-wrap gap-2";
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
                            ? "text-[var(--bx-green)]"
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
                          <span className="text-[var(--bx-green)]">
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

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Authentication</h2>
          <Link
            href="/authenticate"
            className="text-sm !text-[var(--bx-green)] font-semibold"
          >
            + Authenticate an item
          </Link>
        </div>
        {authReqs.length === 0 ? (
          <p className="text-muted">
            No authentication requests yet.{" "}
            <Link href="/authenticate" className="!text-[var(--bx-green)]">
              Submit one →
            </Link>
          </p>
        ) : (
          <div className="space-y-2">
            {authReqs.map((r) => (
              <Link
                key={r.id}
                href={`/authenticate/${r.id}`}
                className="bx-panel px-4 py-3 flex justify-between items-center !text-ink hover:border-[var(--bx-line-strong)]"
              >
                <span>
                  {r.beanieName}
                  <span className="text-muted text-sm">
                    {" "}
                    · {authServiceLabel(r.serviceLevel, r.provider, r.tier)}
                  </span>
                </span>
                <span className="text-sm font-semibold">
                  {formatCents(r.totalCents)} ·{" "}
                  <span className="text-muted font-normal">
                    {r.status.replace(/_/g, " ")}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="listings" className="space-y-3 scroll-mt-24">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">My listings</h2>
          <Link
            href="/sell"
            className="text-sm !text-[var(--bx-green)] font-semibold"
          >
            + List a Beanie
          </Link>
        </div>
        {listings.length === 0 ? (
          <p className="text-muted">
            None yet —{" "}
            <Link href="/sell/first" className="!text-[var(--bx-green)]">
              add your first listing
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
                className="bx-panel p-2 flex items-center gap-3 !text-ink"
              >
                <Link
                  href={`/listings/${l.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0 !text-ink hover:opacity-80"
                >
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[var(--bx-line)] bg-[var(--bx-surface)]">
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
                  <span className="flex-1 min-w-0 truncate">{l.title}</span>
                </Link>
                <span className="text-sm font-semibold whitespace-nowrap">
                  {formatCents(l.priceCents)} ·{" "}
                  <span className="text-muted font-normal">{l.status}</span>
                </span>
                {l.status !== "SOLD" && (
                  <Link
                    href={`/listings/${l.id}/edit`}
                    className="shrink-0 rounded-full border-2 border-[var(--bx-ink)] bg-white !text-ink px-3 py-1 text-xs font-bold shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 transition-transform"
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
            <Link href="/browse" className="!text-[var(--bx-green)]">
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
                  className="bx-panel p-2 flex items-center gap-3 !text-ink"
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
        <OrderList orders={buying} empty="No purchases yet." />
        {buyingCount > buying.length && (
          <p className="text-muted text-xs">
            Showing your {buying.length} most recent of {buyingCount} purchases.
          </p>
        )}
      </section>

      <section id="sales" className="space-y-3 scroll-mt-24">
        <h2 className="text-lg">Sales</h2>
        <OrderList orders={selling} empty="No sales yet." showProceeds />
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

function OrderList({
  orders,
  empty,
  showProceeds = false,
}: {
  orders: {
    id: string;
    status: string;
    itemCents: number;
    platformFeeCents: number;
    totalCents: number;
    listing: { title: string };
  }[];
  empty: string;
  /** Sales list: show the seller's net payout (item − fee) instead of the
   *  buyer's total. */
  showProceeds?: boolean;
}) {
  if (orders.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <div className="space-y-2">
      {orders.map((o) => {
        const amount = showProceeds
          ? o.itemCents - o.platformFeeCents
          : o.totalCents;
        return (
          <Link
            key={o.id}
            href={`/orders/${o.id}`}
            className="bx-panel px-4 py-3 flex justify-between items-center !text-ink hover:border-[var(--bx-line-strong)]"
          >
            <span>{o.listing.title}</span>
            <span className="text-sm font-semibold">
              {formatCents(amount)}
              {showProceeds && (
                <span className="text-muted font-normal"> payout</span>
              )}{" "}
              ·{" "}
              <span className="text-muted font-normal">
                {statusLabel(o.status as never)}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
