import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
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
} as const;

// Memoized per request: generateMetadata and the page both load the profile,
// and without cache() that is two identical queries on every profile view.
const loadProfile = cache(async (id: string) => {
  return prisma.user
    .findUnique({ where: { id }, select: PROFILE_SELECT })
    .catch(() => null);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await loadProfile(id);
  if (!user || user.suspended) return { title: "Collector profile" };
  const name = displayNameOf(user);
  return {
    title: `${name} — Collector Profile`,
    description: `${name} on BeanieXchange: Beanie Babies for sale, collector bio, and member info. Buy, sell, and trade with the community.`,
    alternates: { canonical: `/u/${user.id}` },
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

  const name = displayNameOf(user);
  const isMe = session?.user?.id === user.id;

  const [listings, salesCompleted, followerCount, myFollow] =
    await Promise.all([
      prisma.listing
        .findMany({
          where: { sellerId: user.id, status: "ACTIVE", quantity: { gt: 0 } },
          orderBy: { createdAt: "desc" },
          take: 12,
        })
        .catch(() => []),
      prisma.order
        .count({ where: { sellerId: user.id, status: "COMPLETED" } })
        .catch(() => 0),
      prisma.follow
        .count({ where: { followedId: user.id } })
        .catch(() => 0),
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

  const memberSince = user.createdAt.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* ── Profile header ── */}
      <section className="bx-panel p-6 sm:p-8">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <Avatar src={user.avatarUrl} name={name} size={96} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
              <h1 className="text-2xl truncate">{name}</h1>
              <div className="flex gap-2 shrink-0">
                {isMe ? (
                  <Link href="/dashboard/profile" className="bx-btn bx-btn--ghost !py-2 !px-4 text-sm">
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
                      className="bx-btn !py-2 !px-4 text-sm"
                      callbackPath={`/u/${user.id}`}
                    />
                  </>
                )}
              </div>
            </div>
            <p className="text-sm text-muted">
              Member since {memberSince}
              {followerCount > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-ink">
                    {followerCount} follower{followerCount === 1 ? "" : "s"}
                  </span>
                </>
              )}
              {salesCompleted > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-ink">
                    {salesCompleted} completed sale{salesCompleted === 1 ? "" : "s"}
                  </span>
                </>
              )}
              {listings.length > 0 && (
                <>
                  {" · "}
                  {listings.length}
                  {listings.length === 12 ? "+" : ""} active listing
                  {listings.length === 1 ? "" : "s"}
                </>
              )}
            </p>
            {user.bio && (
              <p className="text-sm text-[var(--bx-ink-soft)] leading-relaxed whitespace-pre-wrap">
                {user.bio}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Active listings ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">
          {isMe ? "Your active listings" : `Beanies from ${name}`}
        </h2>
        {listings.length === 0 ? (
          <div className="bx-panel p-8 text-center text-muted text-sm">
            No active listings right now.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
