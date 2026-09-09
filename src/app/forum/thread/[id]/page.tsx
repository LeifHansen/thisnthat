import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getMyVotes } from "@/lib/forum-queries";
import { VoteButtons } from "@/components/VoteButtons";
import { ReplyForm } from "@/components/ReplyForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await prisma.forumThread
    .findUnique({
      where: { id },
      select: { title: true, body: true, category: { select: { name: true } } },
    })
    .catch(() => null);
  if (!t) return { title: "Forum thread" };
  return {
    title: `${t.title} — BeanieX Forum`,
    description: t.body.slice(0, 160).replace(/\s+/g, " ").trim(),
    alternates: { canonical: `/forum/thread/${id}` },
  };
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const thread = await prisma.forumThread.findUnique({
    where: { id },
    include: {
      category: true,
      author: { select: { name: true } },
      posts: {
        orderBy: [{ score: "desc" }, { createdAt: "asc" }],
        include: { author: { select: { name: true } } },
        // A hot thread can accumulate thousands of replies; rendering them
        // all (each with vote buttons) grows page weight without bound.
        take: 200,
      },
    },
  });
  if (!thread) notFound();

  const myVotes = session?.user
    ? await getMyVotes({
        userId: session.user.id,
        threadIds: [thread.id],
        postIds: thread.posts.map((p) => p.id),
      })
    : {};

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <nav className="text-muted text-sm">
        <Link href="/forum" className="!text-cyan">
          Forum
        </Link>{" "}
        ·{" "}
        <Link href={`/forum/${thread.category.slug}`} className="!text-cyan">
          {thread.category.name}
        </Link>
      </nav>

      <article className="bx-panel p-5 flex items-start gap-4">
        <VoteButtons
          target="thread"
          id={thread.id}
          score={thread.score}
          myVote={myVotes[`thread:${thread.id}`]}
          signedIn={Boolean(session?.user)}
        />
        <div className="flex-1 space-y-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            {thread.isPinned && (
              <span className="bx-badge text-yellow">📌 Pinned</span>
            )}
            {thread.isLocked && (
              <span className="bx-badge text-muted">🔒 Locked</span>
            )}
          </div>
          <h1 className="text-2xl !text-ink">{thread.title}</h1>
          <p className="text-muted text-xs">
            {thread.authorDisplayName ?? thread.author?.name ?? "Anonymous"} ·{" "}
            {thread.createdAt.toISOString().slice(0, 10)}
          </p>
          <p className="whitespace-pre-wrap pt-1">{thread.body}</p>
        </div>
      </article>

      <section className="space-y-3">
        <h2 className="text-lg">
          {thread.posts.length} repl{thread.posts.length === 1 ? "y" : "ies"}
        </h2>
        {thread.posts.length === 0 ? (
          <p className="text-muted text-sm">No replies yet. Start the thread off.</p>
        ) : (
          <div className="space-y-3">
            {thread.posts.map((p) => (
              <div key={p.id} className="bx-panel p-4 flex items-start gap-4">
                <VoteButtons
                  target="post"
                  id={p.id}
                  score={p.score}
                  myVote={myVotes[`post:${p.id}`]}
                  size="sm"
                  signedIn={Boolean(session?.user)}
                />
                <div className="flex-1 space-y-1">
                  <p className="text-muted text-xs">
                    {p.authorDisplayName ?? p.author?.name ?? "Anonymous"} ·{" "}
                    {p.createdAt.toISOString().slice(0, 10)}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {thread.isLocked ? (
        <p className="text-muted text-sm">
          This thread is locked — no new replies.
        </p>
      ) : session?.user ? (
        <ReplyForm threadId={thread.id} />
      ) : (
        <p className="text-muted text-sm">
          <Link
            href={`/auth/signin?next=${encodeURIComponent(`/forum/thread/${thread.id}`)}`}
            className="!text-cyan"
          >
            Sign in
          </Link>{" "}
          to reply.
        </p>
      )}
    </div>
  );
}
