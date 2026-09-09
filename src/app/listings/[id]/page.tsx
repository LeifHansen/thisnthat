import type { Metadata } from "next";
import { jsonLdScript } from "@/lib/jsonLd";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { computeSaleFees, formatCents } from "@/lib/fees";
import { firstRealPhoto } from "@/lib/photos";
import { makeOffer, expireStaleOffers } from "@/lib/offers";
import { AuthBadge } from "@/components/AuthBadge";
import { Avatar } from "@/components/Avatar";
import { FollowButton } from "@/components/FollowButton";
import { LikeButton } from "@/components/LikeButton";
import { MessageUserButton } from "@/components/MessageUserButton";
import { displayNameOf } from "@/lib/users";
import { BuyBox } from "@/components/BuyBox";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { MakeOfferButton } from "@/components/MakeOfferButton";
import { getOtherOptions, getSimilarBeanies } from "@/lib/listings";
import { OtherOptions } from "@/components/OtherOptions";
import { BeanieOptionCard } from "@/components/BeanieOptionCard";

export const dynamic = "force-dynamic";

const AUTH_LABEL: Record<string, string> = {
  TRUE_BLUE: "True Blue Verified",
  BX_FULL_SERVICE: "BX Full Service Authenticated",
  BX_EXPRESS_COA: "BX Express COA",
  THIRD_PARTY_COA: "Third-Party COA",
  UNAUTHENTICATED: "Unauthenticated",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await prisma.listing
    .findUnique({
      where: { id },
      select: {
        title: true,
        beanieName: true,
        description: true,
        priceCents: true,
        photos: true,
        authType: true,
        status: true,
        year: true,
        condition: true,
      },
    })
    .catch(() => null);

  if (!listing) {
    return { title: "Beanie Baby listing", robots: { index: false } };
  }

  const price = `$${(listing.priceCents / 100).toFixed(2)}`;
  const authLabel = AUTH_LABEL[listing.authType] ?? listing.authType;
  const yearPart = listing.year ? ` (${listing.year})` : "";
  const title = `${listing.title}${yearPart} — ${authLabel} | ${price}`;
  const description =
    `${listing.beanieName}${yearPart} for sale on Beanie Xchange — ` +
    `${authLabel}. ${listing.condition ? `Condition: ${listing.condition}. ` : ""}` +
    `Escrow-protected. ${
      listing.description
        ? listing.description.slice(0, 140).replace(/\s+/g, " ").trim()
        : "Authenticated Beanie Baby marketplace."
    }`;

  const ogImages = (listing.photos ?? []).slice(0, 1).map((url) => ({ url }));
  const noIndex = listing.status === "DRAFT" || listing.status === "REMOVED";

  return {
    title,
    description,
    alternates: { canonical: `/listings/${id}` },
    robots: noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      url: `/listings/${id}`,
      type: "website",
      images: ogImages.length ? ogImages : undefined,
    },
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      seller: true,
      lotItems: { orderBy: { position: "asc" } },
    },
  });
  if (!listing) notFound();

  const lotPieces = listing.isLot
    ? listing.lotItems.reduce((n, it) => n + it.quantity, 0)
    : 0;

  // auth() and the opportunistic offer-expiry sweep are independent of each
  // other and of the listing, so run them together. expireStaleOffers writes
  // nothing when nothing is stale (indexed status/expiresAt updateMany) and
  // completes before we read this buyer's pending offer below.
  const [session] = await Promise.all([auth(), expireStaleOffers()]);
  const fees = computeSaleFees(listing.priceCents);
  const isOwn = session?.user?.id === listing.sellerId;

  // DRAFT (never published) and REMOVED (pulled, e.g. failed authentication)
  // listings are not public: the JSON endpoint already 404s them "like the web
  // page" (api/listings/[id]/route.ts) — this is that gate, which was missing.
  // The seller still previews their own from the dashboard, and admins can
  // review anything.
  const isHidden = listing.status === "DRAFT" || listing.status === "REMOVED";
  if (isHidden && !isOwn && session?.user?.role !== "ADMIN") notFound();

  const sold = listing.status === "SOLD" || listing.quantity <= 0;
  const unauth = listing.authType === "UNAUTHENTICATED";

  // Everything below depends only on `listing` and `session`, so it runs as
  // ONE parallel wave instead of a serial waterfall — this is the most-linked
  // page on the site and each extra round trip is pure latency floor.
  //
  // - otherOptions: other sellers' active listings of the same beanie (lots
  //   are unique bundles and skip it).
  // - reviews: verified-buyer aggregate + latest, feeding JSON-LD
  //   aggregateRating (best-effort: a hiccup renders without reviews).
  // - like/follow state for the ♥ button and follow-seller pill.
  // - myPendingOffer: "offer sent" feedback after a server-action redirect.
  const [
    otherOptions,
    reviewAgg,
    recentReviews,
    likeCount,
    myLike,
    myFollow,
    myPendingOffer,
  ] = await Promise.all([
    sold || listing.isLot
      ? []
      : getOtherOptions(listing.beanieName, listing.id, 12),
    prisma.productReview
      .aggregate({
        where: { beanieName: listing.beanieName },
        _avg: { rating: true },
        _count: true,
      })
      .catch(() => null),
    prisma.productReview
      .findMany({
        where: { beanieName: listing.beanieName },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: { buyer: { select: { name: true, displayName: true } } },
      })
      .catch(() => [] as never[]),
    prisma.listingLike.count({ where: { listingId: listing.id } }),
    session?.user
      ? prisma.listingLike.findUnique({
          where: {
            userId_listingId: {
              userId: session.user.id,
              listingId: listing.id,
            },
          },
          select: { id: true },
        })
      : null,
    session?.user && !isOwn
      ? prisma.follow.findUnique({
          where: {
            followerId_followedId: {
              followerId: session.user.id,
              followedId: listing.sellerId,
            },
          },
          select: { id: true },
        })
      : null,
    session?.user && !isOwn
      ? prisma.offer.findFirst({
          where: {
            listingId: listing.id,
            buyerId: session.user.id,
            status: "PENDING",
          },
          select: { id: true, priceCents: true, expiresAt: true, message: true },
        })
      : null,
  ]);
  const reviewCount = reviewAgg?._count ?? 0;
  const ratingAvg =
    reviewCount > 0 && reviewAgg?._avg.rating
      ? Math.round(reviewAgg._avg.rating * 10) / 10
      : null;

  // Only when this is the beanie's lone listing: suggest similar beanies
  // (reads the shared cached group set, so it's cheap after the first hit).
  const similar =
    !sold && !listing.isLot && otherOptions.length === 0
      ? await getSimilarBeanies(listing.beanieName, 8)
      : [];

  // Product JSON-LD so Google can render rich-result cards for the
  // listing in search and Shopping. We only emit it for publicly
  // surfaceable statuses (ACTIVE / SOLD).
  const indexableForLd =
    listing.status === "ACTIVE" || listing.status === "SOLD";
  const productLd = indexableForLd
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: listing.title,
        description: listing.description || `${listing.beanieName} on Beanie Xchange`,
        image: listing.photos?.slice(0, 6) ?? [],
        brand: { "@type": "Brand", name: "Ty" },
        category: "Beanie Babies",
        // Only emitted when genuine verified-buyer reviews exist — Google's
        // policy requires real user reviews for these fields.
        ...(ratingAvg !== null
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: ratingAvg,
                reviewCount,
                bestRating: 5,
                worstRating: 1,
              },
              review: recentReviews.map((r) => ({
                "@type": "Review",
                author: { "@type": "Person", name: displayNameOf(r.buyer) },
                datePublished: r.createdAt.toISOString().slice(0, 10),
                reviewRating: {
                  "@type": "Rating",
                  ratingValue: r.rating,
                  bestRating: 5,
                  worstRating: 1,
                },
                ...(r.body ? { reviewBody: r.body } : {}),
              })),
            }
          : {}),
        offers: {
          "@type": "Offer",
          priceCurrency: "USD",
          price: (listing.priceCents / 100).toFixed(2),
          availability: sold
            ? "https://schema.org/SoldOut"
            : "https://schema.org/InStock",
          itemCondition: "https://schema.org/UsedCondition",
          // Mirrors /returns: 3-day window from delivery, $5 restocking fee
          // (waived when the fault is ours), buyer pays return shipping.
          hasMerchantReturnPolicy: {
            "@type": "MerchantReturnPolicy",
            applicableCountry: "US",
            returnPolicyCategory:
              "https://schema.org/MerchantReturnFiniteReturnWindow",
            merchantReturnDays: 3,
            returnMethod: "https://schema.org/ReturnByMail",
            returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
            restockingFee: {
              "@type": "MonetaryAmount",
              value: 5,
              currency: "USD",
            },
          },
          // Shipping is live-rated at checkout, so no fixed rate is
          // advertised — destination scope only.
          shippingDetails: {
            "@type": "OfferShippingDetails",
            shippingDestination: {
              "@type": "DefinedRegion",
              addressCountry: "US",
            },
            deliveryTime: {
              "@type": "ShippingDeliveryTime",
              handlingTime: {
                "@type": "QuantitativeValue",
                minValue: 1,
                maxValue: 3,
                unitCode: "DAY",
              },
              transitTime: {
                "@type": "QuantitativeValue",
                minValue: 2,
                maxValue: 5,
                unitCode: "DAY",
              },
            },
          },
        },
      }
    : null;

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      {productLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(productLd) }}
        />
      )}
      <div className="space-y-3">
        <PhotoCarousel
          photos={listing.photos}
          alt={listing.title}
          sizes="(max-width:1024px) 100vw, 50vw"
          fit="contain"
        />
      </div>

      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <AuthBadge
            authType={listing.authType}
            registrationNumber={listing.registrationNumber}
            grade={listing.grade}
            size="lg"
          />
          <LikeButton
            listingId={listing.id}
            count={likeCount}
            likedByMe={!!myLike}
            signedIn={!!session?.user}
          />
        </div>
        <h1 className="text-3xl">{listing.title}</h1>
        {listing.isLot ? (
          <p className="text-muted">
            <span className="font-semibold text-[var(--tnt-purple-text)]">
              🎁 Lot · {lotPieces} {lotPieces === 1 ? "beanie" : "beanies"}
            </span>{" "}
            · {listing.condition}
          </p>
        ) : (
          <p className="text-muted">
            {listing.beanieName}
            {listing.year ? ` · ${listing.year}` : ""} · {listing.condition}
          </p>
        )}
        <p className="whitespace-pre-wrap">{listing.description}</p>

        {listing.isLot && listing.lotItems.length > 0 && (
          <div className="tnt-panel p-5 space-y-2">
            <p className="font-display text-lg">
              What&apos;s in this lot{" "}
              <span className="text-muted text-sm font-normal">
                ({lotPieces} total)
              </span>
            </p>
            <ul className="divide-y divide-[var(--tnt-line)]">
              {listing.lotItems.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-3 py-1.5 text-sm"
                >
                  <Link
                    href={`/database?q=${encodeURIComponent(it.beanieName)}`}
                    className="!text-ink hover:!text-[var(--tnt-red)] truncate"
                  >
                    {it.beanieName}
                    {it.year ? (
                      <span className="text-muted"> · {it.year}</span>
                    ) : null}
                  </Link>
                  <span className="text-muted shrink-0 font-semibold">
                    ×{it.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-muted text-sm flex items-center gap-2">
          Seller:{" "}
          <Link
            href={`/u/${listing.sellerId}`}
            className="inline-flex items-center gap-1.5 font-semibold !text-ink hover:underline"
          >
            <Avatar
              src={listing.seller.avatarUrl}
              name={displayNameOf(listing.seller)}
              size={22}
            />
            {displayNameOf(listing.seller)}
          </Link>
          {!isOwn && (
            <FollowButton
              userId={listing.sellerId}
              isFollowing={!!myFollow}
              signedIn={!!session?.user}
              size="sm"
              callbackPath={`/listings/${listing.id}`}
            />
          )}
        </p>
        {listing.trueBlueCertId && (
          <p className="text-sm text-muted">
            True Blue Cert:{" "}
            <span className="text-ink font-medium">
              {listing.trueBlueCertId}
            </span>
          </p>
        )}
        {listing.bxCertId && (
          <p className="text-sm text-muted">
            BX Certificate:{" "}
            <span className="text-ink font-medium">{listing.bxCertId}</span>
            {listing.registrationNumber ? (
              <>
                {" · "}
                <Link
                  href={`/registry?n=${listing.registrationNumber}`}
                  className="!text-[var(--tnt-green)] font-semibold"
                >
                  verify #{listing.registrationNumber}
                </Link>
              </>
            ) : null}
          </p>
        )}

        <div className="tnt-panel p-5 space-y-2">
          <Row label="Item price" value={formatCents(fees.itemCents)} />
          {/* Shipping is live-rated from the seller's ZIP at checkout; no
              number here so the page can't contradict the rated charge. */}
          <Row label="Shipping" value="Calculated at checkout" />
          <div className="border-t border-[var(--tnt-line)] pt-2 flex justify-between font-bold text-[var(--tnt-green)]">
            <span>Total</span>
            <span>{formatCents(fees.itemCents)} + shipping</span>
          </div>
          <p className="text-muted text-sm">
            {unauth
              ? "⚠ Sold AS-IS — no authentication, no Certificate of Authenticity. Ships directly from the seller. Buy at your own risk."
              : "Authenticated before listing. Ships directly from the seller; funds held in escrow until you confirm receipt."}
          </p>
        </div>

        {sold ? (
          <p className="tnt-badge tnt-badge--error">SOLD OUT</p>
        ) : isOwn ? (
          <div className="space-y-3">
            {/* A hidden listing is the seller's own preview — saying buyers
                see purchase options here would be flatly untrue, and a draft
                needs to say how to go live. */}
            {listing.status === "DRAFT" ? (
              <>
                <p className="tnt-badge tnt-badge--error">
                  DRAFT — NOT PUBLISHED
                </p>
                <p className="text-muted">
                  Only you can see this. Publish it from Edit listing to put it
                  on Browse.
                </p>
              </>
            ) : listing.status === "REMOVED" ? (
              <>
                <p className="tnt-badge tnt-badge--error">REMOVED</p>
                <p className="text-muted">
                  This listing has been pulled from the marketplace — only you
                  can see it.
                </p>
              </>
            ) : (
              <p className="text-muted">
                This is your listing — buyers see the purchase options here.
                {listing.minAutoAcceptCents
                  ? ` You're auto-accepting offers ≥ ${formatCents(listing.minAutoAcceptCents)}.`
                  : ""}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href={`/listings/${listing.id}/edit`}
                className="tnt-btn flex-1"
              >
                {listing.status === "DRAFT" ? "Edit & publish" : "Edit listing"}
              </Link>
              <Link
                href="/dashboard"
                className="tnt-btn tnt-btn--ghost flex-1"
              >
                Manage your listings
              </Link>
            </div>
          </div>
        ) : isHidden ? (
          // Only an admin reaches this (the seller takes the branch above and
          // everyone else 404s). A pulled or unpublished listing must never
          // offer a Buy box: it kept quantity > 0, so it was cartable and only
          // failed later at /api/checkout.
          <p className="tnt-badge tnt-badge--error">
            {listing.status === "DRAFT" ? "DRAFT — NOT PUBLISHED" : "REMOVED"}
          </p>
        ) : (
          <div className="space-y-4">
            {listing.quantity > 1 && (
              <p className="text-sm text-muted text-center">
                <span className="font-semibold text-ink">
                  {listing.quantity} available
                </span>{" "}
                from this seller
              </p>
            )}
            <BuyBox
              item={{
                listingId: listing.id,
                title: listing.title,
                priceCents: listing.priceCents,
                photo: firstRealPhoto(listing.photos),
                sellerId: listing.sellerId,
              }}
              totalCents={fees.totalCents}
            />
            <MessageUserButton
              userId={listing.sellerId}
              loggedIn={!!session?.user}
              label="💬 Message seller"
              className="tnt-btn tnt-btn--ghost w-full"
              callbackPath={`/listings/${listing.id}`}
            />
            {session?.user ? (
              <div className="space-y-3">
                {myPendingOffer ? (
                  <div className="tnt-panel p-4 space-y-1 border border-[var(--tnt-line-strong)]">
                    <p className="font-display text-sm">
                      ⏳ Your offer is pending
                    </p>
                    <p className="text-sm">
                      You offered{" "}
                      <b className="text-[var(--tnt-red)]">
                        {formatCents(myPendingOffer.priceCents)}
                      </b>{" "}
                      · expires{" "}
                      {myPendingOffer.expiresAt.toISOString().slice(0, 10)}.
                    </p>
                    <p className="text-muted text-xs">
                      Submit a new offer below to replace this one.
                    </p>
                  </div>
                ) : null}
                <MakeOfferButton
                  listingId={listing.id}
                  listingPriceCents={listing.priceCents}
                  minAutoAcceptCents={listing.minAutoAcceptCents ?? null}
                  makeOffer={makeOffer}
                />
              </div>
            ) : (
              <p className="text-muted text-sm text-center">
                Prefer to haggle?{" "}
                <Link
                  href="/auth/signin"
                  className="!text-[var(--tnt-red)] font-semibold"
                >
                  Log in
                </Link>{" "}
                to make an offer.
              </p>
            )}
          </div>
        )}
      </div>

      {reviewCount > 0 && (
        <section className="lg:col-span-2 min-w-0 space-y-3 pt-2">
          <h2 className="text-xl">
            Buyer reviews{" "}
            <span className="text-muted text-base font-normal">
              ★ {ratingAvg} · {reviewCount} review{reviewCount === 1 ? "" : "s"}{" "}
              {listing.isLot ? "for this lot" : `of ${listing.beanieName}`}
            </span>
          </h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {recentReviews.map((r) => (
              <div key={r.id} className="tnt-panel p-4 space-y-1.5">
                <p
                  aria-label={`${r.rating} out of 5 stars`}
                  className="text-[#f5a623] leading-none"
                >
                  {"★".repeat(r.rating)}
                  <span className="text-[var(--tnt-line-strong)]">
                    {"★".repeat(5 - r.rating)}
                  </span>
                </p>
                {r.body && (
                  <p className="text-sm whitespace-pre-wrap line-clamp-4">{r.body}</p>
                )}
                <p className="text-muted text-xs">
                  {displayNameOf(r.buyer)} · verified buyer ·{" "}
                  {r.createdAt.toISOString().slice(0, 10)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {otherOptions.length > 0 ? (
        <section className="lg:col-span-2 min-w-0 space-y-3 pt-2">
          <h2 className="text-xl">
            Similar Listings{" "}
            <span className="text-muted text-base font-normal">
              ({otherOptions.length} option{otherOptions.length === 1 ? "" : "s"})
            </span>
          </h2>
          <OtherOptions options={otherOptions} />
        </section>
      ) : similar.length > 0 ? (
        <section className="lg:col-span-2 min-w-0 space-y-3 pt-2">
          <h2 className="text-xl">Similar beanies</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {similar.slice(0, 4).map((o) => (
              <BeanieOptionCard key={o.beanieName} option={o} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
