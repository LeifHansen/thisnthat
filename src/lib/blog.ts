"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";

const MAX_TITLE = 200;
const MAX_EXCERPT = 320;
const MAX_CONTENT = 40_000;
const MAX_URL = 2048;

/** Turn a title into a URL-safe slug. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * Find a slug that isn't taken yet. If `base` collides, append -2, -3, …
 * `ignoreId` lets an edit keep its own slug.
 */
async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  const root = slugify(base) || "post";
  // Try root, then root-2, root-3, … until one is free. The upper bound is a
  // safety net; collisions past this fall back to a timestamped suffix.
  for (let n = 1; n <= 200; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const existing = await prisma.blogPost.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === ignoreId) return candidate;
  }
  return `${root}-${Date.now()}`;
}

function field(formData: FormData, name: string, max: number): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

/**
 * Create or update a blog post from the admin editor form.
 * A hidden `id` field switches between create and update. The publish button
 * sends `intent=publish`; "save draft" sends `intent=draft`.
 */
export async function saveBlogPost(formData: FormData) {
  await requireAdmin();

  const id = field(formData, "id", 64);
  const title = field(formData, "title", MAX_TITLE);
  const excerpt = field(formData, "excerpt", MAX_EXCERPT);
  const content = field(formData, "content", MAX_CONTENT);
  const coverImageUrl = field(formData, "coverImageUrl", MAX_URL) || null;
  const sourceUrl = field(formData, "sourceUrl", MAX_URL) || null;
  const intent = field(formData, "intent", 16) || "draft";
  const publish = intent === "publish";

  if (title.length < 3 || content.length < 1) {
    redirect("/admin/blog?err=missing");
  }

  const status = publish ? "PUBLISHED" : "DRAFT";

  if (id) {
    const current = await prisma.blogPost.findUnique({
      where: { id },
      select: { slug: true, title: true, publishedAt: true },
    });
    if (!current) redirect("/admin/blog?err=notfound");

    // Re-slug only when the title changed, so published URLs stay stable.
    const slug =
      current.title === title
        ? current.slug
        : await uniqueSlug(title, id);

    await prisma.blogPost.update({
      where: { id },
      data: {
        title,
        slug,
        excerpt,
        content,
        coverImageUrl,
        sourceUrl,
        status,
        // Stamp publishedAt the first time it goes live; keep it afterwards.
        publishedAt:
          publish && !current.publishedAt ? new Date() : current.publishedAt,
      },
    });
    revalidatePath("/blog");
    revalidatePath(`/blog/${slug}`);
    revalidatePath("/admin/blog");
    redirect("/admin/blog?ok=saved");
  }

  const slug = await uniqueSlug(title);
  await prisma.blogPost.create({
    data: {
      slug,
      title,
      excerpt,
      content,
      coverImageUrl,
      sourceUrl,
      status,
      publishedAt: publish ? new Date() : null,
    },
  });
  revalidatePath("/blog");
  revalidatePath("/admin/blog");
  redirect("/admin/blog?ok=created");
}

/** Toggle a post between DRAFT and PUBLISHED from the admin list. */
export async function toggleBlogPublish(formData: FormData) {
  await requireAdmin();
  const id = field(formData, "id", 64);
  if (!id) return;

  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: { status: true, slug: true, publishedAt: true },
  });
  if (!post) return;

  const willPublish = post.status !== "PUBLISHED";
  await prisma.blogPost.update({
    where: { id },
    data: {
      status: willPublish ? "PUBLISHED" : "DRAFT",
      publishedAt: willPublish && !post.publishedAt ? new Date() : post.publishedAt,
    },
  });
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  revalidatePath("/admin/blog");
}

/** Permanently delete a blog post. */
export async function deleteBlogPost(formData: FormData) {
  await requireAdmin();
  const id = field(formData, "id", 64);
  if (!id) return;

  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: { slug: true },
  });
  await prisma.blogPost.delete({ where: { id } }).catch(() => null);
  revalidatePath("/blog");
  if (post) revalidatePath(`/blog/${post.slug}`);
  revalidatePath("/admin/blog");
}
