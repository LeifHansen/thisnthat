"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

const MAX_TITLE = 160;
const MAX_BODY = 8000;

// NOTE ON CACHING: none of the actions below call `revalidatePath`. Every
// /forum route is `dynamic = "force-dynamic"`, so there is no cached render
// for it to invalidate — and calling it from a Server Action leaves the
// action's response hanging open, so the client never sees the action
// resolve. That is what made the forum look dead: votes were written and
// replies were saved, but the score never moved and the reply box sat on
// "Posting…" forever. The callers (VoteButtons, ReplyForm) refresh the router
// once the action resolves; every other reader renders fresh on their next
// request anyway.

export async function createThread(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin?next=/forum");

  const categorySlug = String(formData.get("category") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim().slice(0, MAX_TITLE);
  const body = String(formData.get("body") ?? "").trim().slice(0, MAX_BODY);

  if (!categorySlug || title.length < 3 || body.length < 1) {
    redirect(`/forum/${categorySlug || ""}/new?err=1`);
  }

  const category = await prisma.forumCategory.findUnique({
    where: { slug: categorySlug },
    select: { id: true, slug: true },
  });
  if (!category) redirect("/forum");

  // Thread + author's own up-vote in one transaction, same as createPost: the
  // thread opens at score 1 AND owns the vote row backing it. Without the row
  // the author's first up-vote counted a second time (score 2, votes 1).
  const thread = await prisma.$transaction(async (tx) => {
    const created = await tx.forumThread.create({
      data: {
        categoryId: category.id,
        authorId: session.user.id,
        title,
        body,
        score: 1,
      },
    });
    await tx.forumVote.create({
      data: {
        userId: session.user.id,
        threadId: created.id,
        value: 1,
      },
    });
    return created;
  });

  redirect(`/forum/thread/${thread.id}`);
}

/**
 * Result of a reply submission. The reply form is a client component driven
 * by `useActionState`, so failures come back as state to render instead of
 * being swallowed — an empty or rejected reply used to look identical to a
 * successful one.
 */
export type ReplyState = { ok: boolean; error?: string };

export async function createPost(
  _prevState: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin?next=/forum");

  const threadId = String(formData.get("threadId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim().slice(0, MAX_BODY);
  if (!threadId) return { ok: false, error: "Missing thread." };
  if (body.length < 1) return { ok: false, error: "Write something first." };

  const thread = await prisma.forumThread.findUnique({
    where: { id: threadId },
    select: { id: true, isLocked: true },
  });
  if (!thread) return { ok: false, error: "That thread no longer exists." };
  if (thread.isLocked)
    return { ok: false, error: "This thread is locked — no new replies." };

  // Post + author's own up-vote in one transaction, mirroring createThread:
  // the reply opens at score 1 AND owns the vote row backing it. Without the
  // row the author's first up-vote counted a second time (score 2, votes 1).
  await prisma.$transaction(async (tx) => {
    const post = await tx.forumPost.create({
      data: {
        threadId,
        authorId: session.user.id,
        body,
        score: 1,
      },
    });
    await tx.forumVote.create({
      data: { userId: session.user.id, postId: post.id, value: 1 },
    });
  });

  // ReplyForm calls router.refresh() once this resolves, which is what puts
  // the new reply on screen.
  return { ok: true };
}

/**
 * Toggle/replace a vote on a thread or post.
 *
 * - First click on +1 → row created with value +1.
 * - Click +1 again → vote removed (toggle off).
 * - Click -1 after +1 → vote flipped to -1.
 *
 * Score deltas are applied as net changes so the denormalised
 * `score` stays consistent with the sum of votes without a full
 * recount on each click.
 */
export async function vote(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;

  const target = String(formData.get("target") ?? ""); // "thread" | "post"
  const id = String(formData.get("id") ?? "").trim();
  const next = Number(formData.get("value")); // +1 or -1

  if (!id || (next !== 1 && next !== -1)) return;
  if (target !== "thread" && target !== "post") return;

  const userId = session.user.id;

  // Read the current vote, mutate it, and apply the net score delta as one
  // atomic transaction so the denormalised `score` can never desync from the
  // votes (a partial failure between the two writes would leave it wrong).
  // A concurrent double-submit hits the @@unique([userId, …]) constraint on
  // the create and rolls back cleanly — caught below so it's a no-op, not a 500.
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.forumVote.findUnique({
        where:
          target === "thread"
            ? { userId_threadId: { userId, threadId: id } }
            : { userId_postId: { userId, postId: id } },
      });

      // Compute net change to score:
      //   no existing vote        → +next
      //   same direction as next  → remove vote, delta = -prev
      //   different direction     → flip, delta = next - prev (== ±2)
      let delta = 0;
      if (!existing) {
        delta = next;
        await tx.forumVote.create({
          data: {
            userId,
            threadId: target === "thread" ? id : null,
            postId: target === "post" ? id : null,
            value: next,
          },
        });
      } else if (existing.value === next) {
        delta = -existing.value;
        await tx.forumVote.delete({ where: { id: existing.id } });
      } else {
        delta = next - existing.value;
        await tx.forumVote.update({
          where: { id: existing.id },
          data: { value: next },
        });
      }

      if (delta !== 0) {
        if (target === "thread") {
          await tx.forumThread.update({
            where: { id },
            data: { score: { increment: delta } },
          });
        } else {
          await tx.forumPost.update({
            where: { id },
            data: { score: { increment: delta } },
          });
        }
      }
    });
  } catch {
    // Concurrent double-submit or a transient error — the vote state is left
    // consistent by the rollback; nothing to surface to the user.
  }
}
