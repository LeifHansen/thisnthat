import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { BlogGenerator } from "@/components/BlogGenerator";
import { BlogManualEditor } from "@/components/BlogManualEditor";
import { toggleBlogPublish, deleteBlogPost } from "@/lib/blog";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Blog Generator · Admin",
  robots: { index: false, follow: false },
};

function loadPosts() {
  return prisma.blogPost.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
    },
    take: 200,
  });
}

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireAdmin();
  const { ok, err } = await searchParams;

  let posts: Awaited<ReturnType<typeof loadPosts>> = [];
  let postsError = false;
  try {
    posts = await loadPosts();
  } catch (e) {
    console.error("admin/blog: failed to load posts", e);
    postsError = true;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--tnt-dark)] text-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--tnt-red)] px-2.5 py-1 text-xs font-bold">
            SUPERADMIN
          </span>
          <span className="text-sm font-semibold">AI Blog Generator</span>
        </div>
        <Link
          href="/admin"
          className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-sm font-semibold !text-white"
        >
          ← Admin dashboard
        </Link>
      </div>

      {ok && (
        <div className="tnt-panel p-3 text-sm text-green border-l-4 border-[var(--tnt-green)]">
          {ok === "created"
            ? "Article created."
            : ok === "saved"
              ? "Article saved."
              : "Done."}
        </div>
      )}
      {err && (
        <div className="tnt-panel p-3 text-sm text-[var(--tnt-red)] border-l-4 border-[var(--tnt-red)]">
          {err === "missing"
            ? "A title and body are required."
            : "Something went wrong."}
        </div>
      )}

      <section className="space-y-2">
        <h1 className="text-ink text-2xl">Generate a blog post</h1>
        <p className="text-muted text-sm">
          Paste a reference article link and an optional cover image. The AI
          fetches the article and writes — or rewrites — it into an original
          post for the {SITE_NAME} blog. Review, edit, then publish.
        </p>
        <BlogGenerator />
      </section>

      <section className="space-y-2">
        <details className="group">
          <summary className="cursor-pointer select-none list-none">
            <span className="inline-flex items-center gap-2">
              <h2 className="text-ink text-xl inline">Write a post manually</h2>
              <span className="tnt-btn tnt-btn--ghost !py-1 !px-3 text-xs group-open:hidden">
                ✍️ Open editor
              </span>
              <span className="tnt-btn tnt-btn--ghost !py-1 !px-3 text-xs hidden group-open:inline-flex">
                Collapse
              </span>
            </span>
          </summary>
          <p className="text-muted text-sm mt-1 mb-3">
            Write your own article from scratch — title, hero image (upload or
            URL), excerpt, and Markdown body. Publishes to the same blog as the
            AI generator.
          </p>
          <BlogManualEditor />
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="text-ink text-xl">All posts</h2>
        {postsError ? (
          <div className="tnt-panel p-6 text-center text-[var(--tnt-red)]">
            Couldn&apos;t load blog posts. The database schema may be out of date
            in this environment.
          </div>
        ) : posts.length === 0 ? (
          <div className="tnt-panel p-6 text-center text-muted">
            No posts yet. Generate your first one above.
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((p) => (
              <div
                key={p.id}
                className="tnt-panel p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-ink truncate">{p.title}</p>
                  <p className="text-muted text-xs">
                    <span
                      className={`tnt-badge mr-2 ${
                        p.status === "PUBLISHED" ? "text-green" : "text-yellow"
                      }`}
                    >
                      {p.status === "PUBLISHED" ? "Published" : "Draft"}
                    </span>
                    /{p.slug} · updated {p.updatedAt.toISOString().slice(0, 10)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {p.status === "PUBLISHED" && (
                    <Link
                      href={`/blog/${p.slug}`}
                      className="tnt-btn tnt-btn--ghost !py-1.5 !px-4"
                    >
                      View
                    </Link>
                  )}
                  <form action={toggleBlogPublish}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      className="tnt-btn !py-1.5 !px-4"
                      type="submit"
                    >
                      {p.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                    </button>
                  </form>
                  <form action={deleteBlogPost}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      className="tnt-btn tnt-btn--ghost !py-1.5 !px-4 !text-[var(--tnt-red)]"
                      type="submit"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
