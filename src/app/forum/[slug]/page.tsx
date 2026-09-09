import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { orderByForSort, getMyVotes, type ForumSort } from "@/lib/forum-queries";
import { VoteButtons } from "@/components/VoteButtons";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cat = await prisma.forumCategory
    .findUnique({ where: { slug }, select: { name: true, description: true } })
    .catch(() => null);
  if (!cat) return { title: "Forum category" };
  return {
    title: `${cat.name} — BeanieX Forum`,
    description: cat.description,
    alternates: { canonical: `/forum/${slug}` },
  };
}

const SORTS: { key: ForumSort; label: string }[] = [
  { key: "hot", label: "Hot" },
  { key: "new", label: "New" },
  { key: "top", label: "Top" },
];

export default async function ForumCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const sort: ForumSort =
    sp.sort === "new" || sp.sort === "top" ? sp.sort : "hot";

  const category = await prisma.forumCategory.findUnique({ where: { slug } });
  if (!category) notFound();

  const session = await auth();

  const threads = await prisma.forumThread.findMany({
    where: { categoryId: category.id },
    orderBy: orderByForSort(sort),
    include: {
      _count: { select: { posts: true } },
      author: { select: { name: true } },
    },
    take: 50,
  });

  const myVotes = session?.user
    ? await getMyVotes({
        userId: session.user.id,
        threadIds: threads.map((t) => t.id),
      })
    : {};

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-muted text-sm">
            <Link href="/forum" className="!text-cyan">
              Forum
            </Link>{" "}
            ·
          </p>
          <h1 className="text-2xl sm:text-3xl !text-ink">{category.name}</h1>
          <p className="text-muted text-sm">{category.description}</p>
        </div>
        <Link
          href={`/forum/${category.slug}/new`}
          className="bx-btn"
          aria-label="Start a new thread"
        >
          + New thread
        </Link>
      </div>

      <nav className="flex gap-2 text-sm">
        {SORTS.map((s) => (
          <Link
            key={s.key}
            href={`/forum/${category.slug}?sort=${s.key}`}
            className={
              s.key === sort
                ? "bx-btn !py-1 !px-3 text-xs"
                : "bx-btn bx-btn--ghost !py-1 !px-3 text-xs"
            }
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {threads.length === 0 ? (
        <p className="text-muted">
          No threads yet. Be the first —{" "}
          <Link href={`/forum/${category.slug}/new`} className="!text-cyan">
            start one →
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {threads.map((t) => (
            <article
              key={t.id}
              className="bx-panel p-4 flex items-start gap-4"
            >
              <VoteButtons
                target="thread"
                id={t.id}
                score={t.score}
                myVote={myVotes[`thread:${t.id}`]}
                signedIn={Boolean(session?.user)}
              />
              <div className="flex-1 space-y-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  {t.isPinned && (
                    <span className="bx-badge text-yellow">📌 Pinned</span>
                  )}
                  <Link
                    href={`/forum/thread/${t.id}`}
                    className="font-display text-lg !text-ink"
                  >
                    {t.title}
                  </Link>
                </div>
                <p className="text-muted text-sm line-clamp-2">{t.body}</p>
                <p className="text-muted text-xs">
                  {t.authorDisplayName ?? t.author?.name ?? "Anonymous"} ·{" "}
                  {t.createdAt.toISOString().slice(0, 10)} ·{" "}
                  {t._count.posts} repl{t._count.posts === 1 ? "y" : "ies"}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
