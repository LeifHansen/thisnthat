import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { looksLikeHandle, sellerPath } from "@/lib/handles";
import { CARD_SELECT, FOR_SALE } from "@/lib/listings";
import { SITE_NAME } from "@/lib/site";
import { Avatar } from "@/components/Avatar";
import { FollowButton } from "@/components/FollowButton";
import { ListingCard } from "@/components/ListingCard";
import { MessageUserButton } from "@/components/MessageUserButton";
import { displayNameOf } from "@/lib/users";

export const dynamic = "force-dynamic";

const PROFILE_SELECT = {
  id: true,
  name: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  suspended: true,
  createdAt: true,
  handle: true,
} as const;

const LISTINGS_SHOWN = 24;

// Memoized per request: generateMetadata and the page both load the profile,
// and without cache() that is two identical queries on every profile view.
//
// The segment is a handle (/u/sams-closet) or, as the fallback every older
// link and every seller without a handle uses, a user id (/u/<cuid>). Handles
// are checked first; a cuid happens to satisfy the handle grammar but never
// collides with one in practice, and a miss falls through to the id lookup.
const loadProfile = cache(async (key: string) => {
  if (looksLikeHandle(key)) {
    const byHandle = await prisma.user
      .findUnique({ where: { handle: key }, select: PROFILE_SELECT })
      .catch(() => null);
    if (byHandle) return byHandle;
  }
  return prisma.user
    .findUnique({ where: { id: key }, select: PROFILE_SELECT })
    .catch(() => null);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await loadProfile(id);
  if (!user || user.suspended) return { title: "Seller profile" };
  const name = displayNameOf(user);
  return {
    title: `${name} — Seller Profile`,
    description: `${name} on ${SITE_NAME}: items for sale, seller rating and buyer reviews.`,
    alternates: { canonical: sellerPath(user) },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, session] = await Promise.all([loadProfile(id), auth()]);
  if (!user || user.suspended) notFound();
  // One canonical address per seller: an id link to someone who has picked a
  // handle moves to the handle permanently.
  if (user.handle && id !== user.handle) permanentRedirect(sellerPath(user));

  const name = displayNameOf(user);
  const isMe = session?.user?.id === user.id;

  const [
    listings,
    itemCount,
    salesCompleted,
    followerCount,
    reviewAgg,
    recentReviews,
    myFollow,
  ] = await Promise.all([
    prisma.listing
      .findMany({
        where: { ...FOR_SALE, sellerId: user.id },
        orderBy: { createdAt: "desc" },
        take: LISTINGS_SHOWN,
        select: CARD_SELECT,
      })
      .catch(() => []),
    prisma.listing
      .count({ where: { ...FOR_SALE, sellerId: user.id } })
      .catch(() => 0),
    prisma.order
      .count({ where: { sellerId: user.id, status: "COMPLETED" } })
      .catch(() => 0),
    prisma.follow
      .count({ where: { followedId: user.id } })
      .catch(() => 0),
    prisma.productReview
      .aggregate({
        where: { sellerId: user.id },
        _avg: { rating: true },
        _count: true,
      })
      .catch(() => null),
    prisma.productReview
      .findMany({
        where: { sellerId: user.id },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: {
          buyer: { select: { name: true, displayName: true } },
          listing: { select: { id: true, title: true } },
        },
      })
      .catch(() => [] as never[]),
    session?.user && !isMe
      ? prisma.follow
          .findUnique({
            where: {
              followerId_followedId: {
                followerId: session.user.id,
                followedId: user.id,
              },
            },
            select: { id: true },
          })
          .catch(() => null)
      : null,
  ]);

  const reviewCount = reviewAgg?._count ?? 0;
  const ratingAvg =
    reviewCount > 0 && reviewAgg?._avg.rating
      ? Math.round(reviewAgg._avg.rating * 10) / 10
      : null;

  const memberSince = user.createdAt.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* ── Profile header ── */}
      <section className="tnt-panel p-6 sm:p-8">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <Avatar src={user.avatarUrl} name={name} size={96} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
              <h1 className="text-2xl truncate">{name}</h1>
              <div className="flex gap-2 shrink-0">
                {isMe ? (
                  <Link href="/dashboard/profile" className="tnt-btn tnt-btn--ghost !py-2 !px-4 text-sm">
                    Edit profile
                  </Link>
                ) : (
                  <>
                    <FollowButton
                      userId={user.id}
                      isFollowing={!!myFollow}
                      signedIn={!!session?.user}
                    />
                    <MessageUserButton
                      userId={user.id}
                      loggedIn={!!session?.user}
                      label={`Message ${name.split(" ")[0]}`}
                      className="tnt-btn !py-2 !px-4 text-sm"
                      callbackPath={sellerPath(user)}
                    />
                  </>
                )}
              </div>
            </div>
            <p className="text-sm">
              {ratingAvg !== null ? (
                <>
                  <span className="text-[#f5a623]" aria-hidden="true">★</span>{" "}
                  <span className="font-semibold text-ink">{ratingAvg}</span>{" "}
                  <span className="text-muted">
                    ({reviewCount} review{reviewCount === 1 ? "" : "s"})
                  </span>
                </>
              ) : (
                <span className="text-muted">No reviews yet</span>
              )}
            </p>
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </span>{" "}
              for sale
              {salesCompleted > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-ink">
                    {salesCompleted} completed sale{salesCompleted === 1 ? "" : "s"}
                  </span>
                </>
              )}
              {followerCount > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-ink">
                    {followerCount} follower{followerCount === 1 ? "" : "s"}
                  </span>
                </>
              )}
              {" · "}Joined {memberSince}
            </p>
            {user.bio && (
              <p className="text-sm text-[var(--tnt-ink-soft)] leading-relaxed whitespace-pre-wrap">
                {user.bio}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── For sale ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">
          {isMe ? "Your items for sale" : `For sale from ${name}`}
          {itemCount > listings.length && (
            <span className="text-muted text-base font-normal">
              {" "}
              · showing {listings.length} of {itemCount}
            </span>
          )}
        </h2>
        {listings.length === 0 ? (
          <div className="tnt-panel p-8 text-center text-muted text-sm">
            Nothing for sale right now.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>

      {/* ── Reviews ── */}
      {reviewCount > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold">
            Recent reviews{" "}
            <span className="text-muted text-base font-normal">
              ★ {ratingAvg} · {reviewCount} review{reviewCount === 1 ? "" : "s"}
            </span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                <Link
                  href={`/listings/${r.listing.id}`}
                  className="block text-xs font-semibold !text-ink hover:underline truncate"
                >
                  {r.listing.title}
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
