import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { createThread } from "@/lib/forum";
import { FormSubmitButton } from "@/components/FormSubmitButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Start a thread · BeanieX Forum",
  robots: { index: false, follow: false },
};

export default async function NewThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const sp = await searchParams;
  const category = await prisma.forumCategory.findUnique({
    where: { slug },
    select: { name: true, description: true, slug: true },
  });
  if (!category) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <header className="space-y-1">
        <p className="text-muted text-sm">
          <Link href="/forum" className="!text-cyan">
            Forum
          </Link>{" "}
          ·{" "}
          <Link href={`/forum/${category.slug}`} className="!text-cyan">
            {category.name}
          </Link>
        </p>
        <h1 className="text-2xl !text-ink">Start a thread</h1>
        <p className="text-muted text-sm">{category.description}</p>
      </header>

      <form action={createThread} className="bx-panel p-5 space-y-4">
        <input type="hidden" name="category" value={category.slug} />
        <label className="block space-y-1">
          <span className="text-sm text-ink">Title</span>
          <input
            name="title"
            required
            minLength={3}
            maxLength={160}
            className="bx-input"
            placeholder="A good question or a clear opinion."
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-ink">Body</span>
          <textarea
            name="body"
            required
            rows={8}
            maxLength={8000}
            className="bx-input"
            placeholder="Photos? Drop image URLs in-line. Markdown is plain text for now."
          />
        </label>
        {sp.err && (
          <p className="text-pink text-sm">
            Title needs at least 3 characters and the body can&apos;t be empty.
          </p>
        )}
        <div className="flex gap-3">
          <FormSubmitButton className="bx-btn flex-1" pendingLabel="Posting…">
            Post thread
          </FormSubmitButton>
          <Link
            href={`/forum/${category.slug}`}
            className="bx-btn bx-btn--ghost"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
