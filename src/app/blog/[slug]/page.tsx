import { cache } from "react";
import type { Metadata } from "next";
import { jsonLdScript } from "@/lib/jsonLd";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { BlogContent } from "@/components/BlogContent";

// ISR: a published post is public + non-personalized. The blog actions
// revalidatePath(`/blog/${slug}`) on edit/publish/delete, so changes show
// immediately while normal traffic is served a cached page.
export const revalidate = 3600;

const DEFAULT_AUTHOR = `${SITE_NAME} Team`;

// Memoized per request: generateMetadata and the page both need the post, and
// without cache() that is two identical queries on every blog view.
const loadPost = cache(async (slug: string) => {
  return prisma.blogPost
    .findFirst({
      where: { slug, status: "PUBLISHED" },
    })
    .catch(() => null);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return { title: "Blog post" };
  return {
    title: `${post.title} — ${SITE_NAME} Blog`,
    description: post.excerpt || post.content.slice(0, 160),
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      url: `${SITE_URL}/blog/${post.slug}`,
      images: post.coverImageUrl ? [{ url: post.coverImageUrl }] : undefined,
      publishedTime: (post.publishedAt ?? post.createdAt).toISOString(),
    },
  };
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();

  const published = post.publishedAt ?? post.createdAt;

  return (
    <article className="space-y-6 max-w-3xl mx-auto">
      <Script
        id="ld-blogposting"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.excerpt,
            image: post.coverImageUrl ? [post.coverImageUrl] : undefined,
            datePublished: published.toISOString(),
            dateModified: post.updatedAt.toISOString(),
            author: {
              "@type": "Organization",
              name: post.authorDisplayName ?? SITE_NAME,
            },
            publisher: {
              "@type": "Organization",
              name: SITE_NAME,
              logo: {
                "@type": "ImageObject",
                url: `${SITE_URL}/tnt-logo.png`,
              },
            },
            mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
          }),
        }}
      />

      <nav className="text-muted text-sm">
        <Link href="/blog" className="!text-cyan">
          ← {SITE_NAME} Blog
        </Link>
      </nav>

      <header className="space-y-3">
        <h1 className="text-3xl sm:text-4xl !text-ink">{post.title}</h1>
        <p className="text-muted text-sm">
          {post.authorDisplayName ?? DEFAULT_AUTHOR} · {formatDate(published)}
        </p>
        {post.excerpt && (
          <p className="text-lg text-[var(--tnt-ink-soft)]">{post.excerpt}</p>
        )}
      </header>

      {post.coverImageUrl && (
        <div className="relative w-full aspect-[16/9] overflow-hidden rounded-xl bg-[var(--tnt-surface)]">
          <Image
            src={post.coverImageUrl}
            alt={post.title}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
            priority
          />
        </div>
      )}

      <BlogContent content={post.content} />

      {post.sourceUrl && (
        <p className="text-xs text-muted border-t border-[var(--tnt-line)] pt-4">
          Based on reporting from{" "}
          <a
            href={post.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="!text-cyan underline"
          >
            the original article ↗
          </a>
          .
        </p>
      )}

      <div className="pt-2">
        <Link href="/blog" className="tnt-btn tnt-btn--ghost">
          ← More from the blog
        </Link>
      </div>
    </article>
  );
}
