import { prisma } from "@/lib/db";

export type ForumSort = "hot" | "new" | "top";

/**
 * "Hot" ordering: a poor man's Reddit hot. We don't need a stored
 * `hotScore` column — we just sort by score and tiebreak by recency,
 * then let pinned threads bubble to the top. Cheap and good enough
 * for v1 traffic. Switch to a precomputed column when threads pass ~10k.
 */
export function orderByForSort(sort: ForumSort) {
  if (sort === "new") return [{ createdAt: "desc" as const }];
  if (sort === "top")
    return [{ score: "desc" as const }, { createdAt: "desc" as const }];
  return [
    { isPinned: "desc" as const },
    { score: "desc" as const },
    { createdAt: "desc" as const },
  ];
}

/**
 * Returns a map of `${target}:${id}` → vote value (+1 / -1) for the
 * current user. Used by list pages to highlight the buttons they've
 * already clicked. Server-side data fetcher (not an RPC server action).
 */
export async function getMyVotes(args: {
  userId: string;
  threadIds?: string[];
  postIds?: string[];
}): Promise<Record<string, number>> {
  const { userId, threadIds = [], postIds = [] } = args;
  if (threadIds.length === 0 && postIds.length === 0) return {};

  const votes = await prisma.forumVote.findMany({
    where: {
      userId,
      OR: [
        threadIds.length ? { threadId: { in: threadIds } } : undefined,
        postIds.length ? { postId: { in: postIds } } : undefined,
      ].filter(Boolean) as object[],
    },
    select: { threadId: true, postId: true, value: true },
  });

  const map: Record<string, number> = {};
  for (const v of votes) {
    if (v.threadId) map[`thread:${v.threadId}`] = v.value;
    if (v.postId) map[`post:${v.postId}`] = v.value;
  }
  return map;
}
