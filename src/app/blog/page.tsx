import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { SITE_NAME } from "@/lib/site";

// ISR: blog content is public and non-personalized. saveBlogPost /
// toggleBlogPublish / deleteBlogPost call revalidatePath("/blog"), so new or
// edited posts appear immediately while normal traffic gets a cached page.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Blog — Resale Tips, Thrift Finds & Selling Guides",
  description: `The ${SITE_NAME} blog: how to price and photograph what you sell, thrift and vintage finds, secondhand shopping guides, and stories from the resale community.`,
  alternates: { canonical: "/blog" },
  keywords: [
    "resale tips",
    "thrift finds",
    "vintage guide",
    "how to sell secondhand",
    "secondhand shopping",
  ],
};

const DEFAULT_AUTHOR = `${SITE_NAME} Team`;

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogIndex() {
  let posts: {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    coverImageUrl: string | null;
    authorDisplayName: string | null;
    publishedAt: Date | null;
    createdAt: Date;
  }[] = [];
  try {
    posts = await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImageUrl: true,
        authorDisplayName: true,
        publishedAt: true,
        createdAt: true,
      },
      take: 100,
    });
  } catch (e) {
    console.error("blog: failed to load posts", e);
  }

  const [featured, ...rest] = posts;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* No static hero asset: a gradient banner keeps the header light and
          means the page never depends on a file in /public. */}
      <header
        className="rounded-xl px-6 py-10 sm:py-14 text-center space-y-3"
        style={{
          background:
            "linear-gradient(135deg, var(--tnt-surface) 0%, color-mix(in srgb, var(--tnt-blue-bright) 28%, var(--tnt-surface)) 55%, color-mix(in srgb, var(--tnt-green-bright) 28%, var(--tnt-surface)) 100%)",
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          The {SITE_NAME} blog
        </p>
        <h1 className="font-display text-3xl sm:text-4xl !text-ink">
          Resale tips, thrift finds &amp; selling guides
        </h1>
        <p className="text-muted max-w-xl mx-auto">
          How to price, photograph and ship what you sell, what to look for
          when you buy secondhand, and stories from people who do both.
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="tnt-panel p-10 text-center text-muted">
          No posts yet — check back soon.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Featured (newest) post */}
          <Link
            href={`/blog/${featured.slug}`}
            className="tnt-panel block overflow-hidden !text-ink hover:border-[var(--tnt-line-strong)]"
          >
            {featured.coverImageUrl && (
              <div className="relative w-full aspect-[16/7] bg-[var(--tnt-surface)]">
                <Image
                  src={featured.coverImageUrl}
                  alt={featured.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-cover"
                />
              </div>
            )}
            <div className="p-6 space-y-2">
              <p className="text-xs text-muted">
                {featured.authorDisplayName ?? DEFAULT_AUTHOR} ·{" "}
                {formatDate(featured.publishedAt ?? featured.createdAt)}
              </p>
              <h2 className="font-display text-2xl">{featured.title}</h2>
              <p className="text-muted">{featured.excerpt}</p>
              <span className="text-[var(--tnt-red)] font-semibold text-sm">
                Read article →
              </span>
            </div>
          </Link>

          {/* Remaining posts */}
          {rest.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              {rest.map((p) => (
                <Link
                  key={p.id}
                  href={`/blog/${p.slug}`}
                  className="tnt-panel block overflow-hidden !text-ink hover:border-[var(--tnt-line-strong)]"
                >
                  {p.coverImageUrl && (
                    <div className="relative w-full aspect-[16/9] bg-[var(--tnt-surface)]">
                      <Image
                        src={p.coverImageUrl}
                        alt={p.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 384px"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4 space-y-1.5">
                    <p className="text-xs text-muted">
                      {formatDate(p.publishedAt ?? p.createdAt)}
                    </p>
                    <h3 className="font-display text-lg leading-tight">
                      {p.title}
                    </h3>
                    <p className="text-muted text-sm line-clamp-3">{p.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
