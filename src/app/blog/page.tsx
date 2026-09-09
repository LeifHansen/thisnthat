import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";

// ISR: blog content is public and non-personalized. saveBlogPost /
// toggleBlogPublish / deleteBlogPost call revalidatePath("/blog"), so new or
// edited posts appear immediately while normal traffic gets a cached page.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Beanie Baby Blog — News, Value Guides & Collecting Tips",
  description:
    "The Beanie Xchange blog: Beanie Baby value guides, authentication tips, rare finds, market news, and collecting how-tos for Ty Beanie Baby collectors.",
  alternates: { canonical: "/blog" },
  keywords: [
    "Beanie Baby blog",
    "Beanie Baby news",
    "Beanie Baby value guide",
    "Beanie Baby collecting tips",
    "rare Beanie Babies",
  ],
};

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
      <header className="space-y-2 text-center">
        <Image
          src="/blog-hero-image.webp"
          alt="The Beanie Xchange Blog — Beanie Baby news, value guides, and collecting tips."
          width={1983}
          height={793}
          priority
          sizes="(max-width:1024px) 100vw, 56rem"
          className="w-full h-auto rounded-xl"
        />
        <h1 className="sr-only">
          Beanie Baby news, value guides &amp; collecting tips
        </h1>
      </header>

      {posts.length === 0 ? (
        <div className="bx-panel p-10 text-center text-muted">
          No posts yet — check back soon.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Featured (newest) post */}
          <Link
            href={`/blog/${featured.slug}`}
            className="bx-panel block overflow-hidden !text-ink hover:border-[var(--bx-line-strong)]"
          >
            {featured.coverImageUrl && (
              <div className="relative w-full aspect-[16/7] bg-[var(--bx-surface)]">
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
                {featured.authorDisplayName ?? "BeanieX Team"} ·{" "}
                {formatDate(featured.publishedAt ?? featured.createdAt)}
              </p>
              <h2 className="font-display text-2xl">{featured.title}</h2>
              <p className="text-muted">{featured.excerpt}</p>
              <span className="text-[var(--bx-red)] font-semibold text-sm">
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
                  className="bx-panel block overflow-hidden !text-ink hover:border-[var(--bx-line-strong)]"
                >
                  {p.coverImageUrl && (
                    <div className="relative w-full aspect-[16/9] bg-[var(--bx-surface)]">
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
