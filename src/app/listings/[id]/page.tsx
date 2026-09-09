import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Condition } from "@prisma/client";
import { jsonLdScript } from "@/lib/jsonLd";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { computeSaleFees, formatCents } from "@/lib/fees";
import { firstRealPhoto } from "@/lib/photos";
import { makeOffer, expireStaleOffers } from "@/lib/offers";
import { attributeEntries, getCategory, readAttributes } from "@/lib/categories";
import { conditionLabel } from "@/lib/listingOptions";
import { getMoreFromSeller, getSimilarListings } from "@/lib/listings";
import { displayNameOf } from "@/lib/users";
import { SITE_NAME } from "@/lib/site";
import { Avatar } from "@/components/Avatar";
import { BuyBox } from "@/components/BuyBox";
import { ConditionBadge } from "@/components/ConditionBadge";
import { FollowButton } from "@/components/FollowButton";
import { LikeButton } from "@/components/LikeButton";
import { ListingCard } from "@/components/ListingCard";
import { MakeOfferButton } from "@/components/MakeOfferButton";
import { MessageUserButton } from "@/components/MessageUserButton";
import { PhotoCarousel } from "@/components/PhotoCarousel";

export const dynamic = "force-dynamic";

// schema.org OfferItemCondition per our condition vocabulary.
const SCHEMA_CONDITION: Record<Condition, string> = {
  NEW: "https://schema.org/NewCondition",
  LIKE_NEW: "https://schema.org/UsedCondition",
  GOOD: "https://schema.org/UsedCondition",
  FAIR: "https://schema.org/UsedCondition",
  FOR_PARTS: "https://schema.org/DamagedCondition",
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
        brand: true,
        description: true,
        priceCents: true,
        photos: true,
        status: true,
        condition: true,
        category: { select: { name: true } },
      },
    })
    .catch(() => null);

  if (!listing) {
    return { title: "Listing", robots: { index: false } };
  }

  const price = formatCents(listing.priceCents);
  const cond = conditionLabel(listing.condition);
  const title = `${listing.title} — ${cond} | ${price}`;
  const lead = [listing.brand, listing.category.name, cond]
    .filter(Boolean)
    .join(" · ");
  const excerpt = listing.description
    ? listing.description.slice(0, 140).replace(/\s+/g, " ").trim()
    : "";
  const description =
    `${lead} — for sale on ${SITE_NAME} for ${price}. ` +
    (excerpt || "Your payment is held until you confirm delivery.");

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
      category: true,
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

  // DRAFT (never published) and REMOVED (pulled by the seller or a moderator)
  // listings are not public: the JSON endpoint 404s them
  // (api/listings/[id]/route.ts) and so does this page. The seller still
  // previews their own from the dashboard, and admins can review anything.
  const isHidden = listing.status === "DRAFT" || listing.status === "REMOVED";
  if (isHidden && !isOwn && session?.user?.role !== "ADMIN") notFound();

  const sold = listing.status === "SOLD" || listing.quantity <= 0;
  const categoryDef = getCategory(listing.category.slug);
  const specs = attributeEntries(categoryDef, readAttributes(listing.attributes));
  const sellerName = displayNameOf(listing.seller);

  // Everything below depends only on `listing` and `session`, so it runs as
  // ONE parallel wave instead of a serial waterfall — this is the most-linked
  // page on the site and each extra round trip is pure latency floor.
  //
  // - reviews: the SELLER's verified-buyer aggregate + latest three (reviews
  //   are keyed by seller, so a brand-new listing still shows a track record),
  //   feeding JSON-LD aggregateRating (best-effort: a hiccup renders without).
  // - moreFromSeller / similar: the two card rails under the fold.
  // - like/follow state for the ♥ button and follow-seller pill.
  // - myPendingOffer: "offer sent" feedback after a server-action redirect.
  const [
    reviewAgg,
    recentReviews,
    moreFromSeller,
    similar,
    likeCount,
    myLike,
    myFollow,
    myPendingOffer,
  ] = await Promise.all([
    prisma.productReview
      .aggregate({
        where: { sellerId: listing.sellerId },
        _avg: { rating: true },
        _count: true,
      })
      .catch(() => null),
    prisma.productReview
      .findMany({
        where: { sellerId: listing.sellerId },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: { buyer: { select: { name: true, displayName: true } } },
      })
      .catch(() => [] as never[]),
    getMoreFromSeller(listing.sellerId, listing.id, 8).catch(() => []),
    getSimilarListings(listing.categoryId, listing.id, 8).catch(() => []),
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
        description:
          listing.description ||
          `${listing.title} — ${listing.category.name} on ${SITE_NAME}`,
        image: listing.photos?.slice(0, 6) ?? [],
        ...(listing.brand
          ? { brand: { "@type": "Brand", name: listing.brand } }
          : {}),
        category: listing.category.name,
        // Only emitted when genuine verified-buyer reviews exist — Google's
        // policy requires real user reviews for these fields. Ours are the
        // seller's reviews, which is what a buyer is actually rating.
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
          itemCondition: SCHEMA_CONDITION[listing.condition],
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

  const categoryHref = `/browse?category=${encodeURIComponent(listing.category.slug)}`;

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
          <ConditionBadge condition={listing.condition} size="lg" />
          <LikeButton
            listingId={listing.id}
            count={likeCount}
            likedByMe={!!myLike}
            signedIn={!!session?.user}
          />
        </div>
        <h1 className="text-3xl">{listing.title}</h1>
        <p className="text-muted">
          {listing.isLot && (
            <>
              <span className="font-semibold text-[var(--tnt-purple-text)]">
                Lot · {lotPieces} {lotPieces === 1 ? "item" : "items"}
              </span>
              {" · "}
            </>
          )}
          {listing.brand && <>{listing.brand} · </>}
          {listing.itemName && <>{listing.itemName} · </>}
          <Link href={categoryHref} className="!text-ink font-semibold hover:underline">
            {listing.category.name}
          </Link>
        </p>
        <p className="whitespace-pre-wrap">{listing.description}</p>

        {specs.length > 0 && (
          <div className="tnt-panel p-5 space-y-2">
            <p className="font-display text-lg">Details</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {specs.map((s) => (
                <div key={s.key} className="contents">
                  <dt className="text-muted">{s.label}</dt>
                  <dd className="text-ink font-medium break-words">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

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
                  <span className="text-ink truncate">{it.name}</span>
                  <span className="text-muted shrink-0 font-semibold">
                    ×{it.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Seller */}
        <div className="tnt-panel p-4 flex items-center gap-3">
          <Link href={`/u/${listing.sellerId}`} className="shrink-0">
            <Avatar src={listing.seller.avatarUrl} name={sellerName} size={44} />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/u/${listing.sellerId}`}
              className="font-semibold !text-ink hover:underline block truncate"
            >
              {sellerName}
            </Link>
            <p className="text-muted text-sm">
              {ratingAvg !== null ? (
                <>
                  <span className="text-[#f5a623]" aria-hidden="true">★</span>{" "}
                  <span className="text-ink font-semibold">{ratingAvg}</span> ({reviewCount})
                </>
              ) : (
                "No reviews yet"
              )}
            </p>
          </div>
          {!isOwn && (
            <FollowButton
              userId={listing.sellerId}
              isFollowing={!!myFollow}
              signedIn={!!session?.user}
              size="sm"
              callbackPath={`/listings/${listing.id}`}
            />
          )}
        </div>

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
            Pay now — your payment is held until you confirm delivery, then the
            seller is paid.
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
            Reviews for {sellerName}{" "}
            <span className="text-muted text-base font-normal">
              ★ {ratingAvg} · {reviewCount} review{reviewCount === 1 ? "" : "s"}
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
          <Link
            href={`/u/${listing.sellerId}`}
            className="inline-block text-sm font-semibold !text-[var(--tnt-red)]"
          >
            See all reviews →
          </Link>
        </section>
      )}

      {moreFromSeller.length > 0 && (
        <section className="lg:col-span-2 min-w-0 space-y-3 pt-2">
          <h2 className="text-xl">
            More from this seller{" "}
            <Link
              href={`/u/${listing.sellerId}`}
              className="text-base font-normal !text-[var(--tnt-red)]"
            >
              View all →
            </Link>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {moreFromSeller.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}

      {similar.length > 0 && (
        <section className="lg:col-span-2 min-w-0 space-y-3 pt-2">
          <h2 className="text-xl">
            Similar in{" "}
            <Link href={categoryHref} className="!text-ink hover:underline">
              {listing.category.name}
            </Link>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {similar.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}
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
