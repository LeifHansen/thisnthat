import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BeanieX Forum — Beanie Baby collector discussion",
  description:
    "Talk Beanie Babies with other collectors on the BeanieX Forum. Authentication help, rare and vintage finds, buying & selling advice, and your latest pickups.",
  alternates: { canonical: "/forum" },
  keywords: [
    "Beanie Baby forum",
    "Beanie Baby collector community",
    "Beanie Baby discussion",
    "Beanie Baby authentication help",
  ],
};

export default async function ForumIndex() {
  const categories = await prisma.forumCategory.findMany({
    orderBy: { position: "asc" },
    include: {
      _count: { select: { threads: true } },
      threads: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, title: true, createdAt: true },
      },
    },
  });

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="space-y-2 text-center">
        <span className="bx-badge text-yellow mx-auto">BeanieX Forum</span>
        <h1 className="text-3xl sm:text-4xl !text-ink">
          The Beanie Baby collector community
        </h1>
        <p className="text-muted max-w-2xl mx-auto">
          Authentication help, rare finds, value chat, and show-and-tell.
          Up-vote what&apos;s useful, down-vote what isn&apos;t. Sign in to post.
        </p>
      </header>

      <div className="space-y-3">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/forum/${c.slug}`}
            className="bx-panel p-5 block !text-ink hover:border-[var(--bx-line-strong)]"
          >
            <div className="flex justify-between items-baseline gap-3 flex-wrap">
              <h2 className="font-display text-xl">{c.name}</h2>
              <span className="text-muted text-sm">
                {c._count.threads} thread{c._count.threads === 1 ? "" : "s"}
              </span>
            </div>
            <p className="text-muted text-sm mt-1">{c.description}</p>
            {c.threads[0] && (
              <p className="text-xs text-muted mt-2">
                Latest: <span className="text-ink">{c.threads[0].title}</span>
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
