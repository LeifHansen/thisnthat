import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { CATEGORIES } from "@/lib/categories";
import { PLATFORM_FEE_LABEL } from "@/lib/fees";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { canOptimizeImage } from "@/lib/photos";
import {
  countActiveLots,
  countByCategory,
  getListingsPage,
  sweepAbandonedReservations,
} from "@/lib/listings";
import { sweepFirstListingNudges } from "@/lib/nudges";
import type { ListingCardData } from "@/components/ListingCard";
import { NewlyListedRail } from "@/components/NewlyListedRail";
import { LoadMoreGrid } from "@/components/LoadMoreGrid";
import { ShieldIcon, TagIcon, TruckIcon } from "@/components/BrandIcons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: `${SITE_TAGLINE} List clothes, shoes, electronics, art, cards, collectibles and more in minutes, and sell to anyone. Payment is held until the buyer confirms delivery.`,
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

const PAGE_SIZE = 12;

const sectionLink = "text-sm font-bold !text-[var(--tnt-red)] shrink-0";

// Category tiles cycle through the neon palette for the glyph square.
const NEON = [
  "var(--tnt-neon-green)",
  "var(--tnt-neon-pink)",
  "var(--tnt-neon-blue)",
  "var(--tnt-neon-yellow)",
] as const;

// ── Data sections (each streams in behind its own Suspense boundary) ──

async function CategoryTiles() {
  // countByCategory() keys by category id; the tiles are defined by slug.
  let bySlug = new Map<string, number>();
  try {
    const [rows, byId] = await Promise.all([
      prisma.category.findMany({ select: { id: true, slug: true } }),
      countByCategory(),
    ]);
    bySlug = new Map(rows.map((r) => [r.slug, byId.get(r.id) ?? 0]));
  } catch {
    bySlug = new Map();
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {CATEGORIES.map((c, i) => {
        const n = bySlug.get(c.slug) ?? 0;
        return (
          <Link
            key={c.slug}
            href={`/browse?category=${c.slug}`}
            title={c.blurb}
            className="tnt-card p-4 flex items-center gap-3 !text-ink"
          >
            <span
              className="text-2xl leading-none grid place-items-center h-12 w-12 shrink-0 rounded-xl border-[3px] border-[var(--tnt-ink)]"
              style={{ background: NEON[i % NEON.length] }}
              aria-hidden
            >
              {c.emoji}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold leading-tight truncate">
                {c.name}
              </span>
              <span className="block text-xs text-muted mt-0.5">
                {n === 0
                  ? "Be the first to list"
                  : n === 1
                    ? "1 listing"
                    : `${n} listings`}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function CategoryTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {CATEGORIES.map((c) => (
        <div key={c.slug} className="tnt-card p-4 flex items-center gap-3">
          <span className="text-3xl leading-none" aria-hidden>
            {c.emoji}
          </span>
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block font-semibold leading-tight truncate">
              {c.name}
            </span>
            <span className="block animate-pulse rounded bg-[var(--tnt-line)] h-3 w-16" />
          </span>
        </div>
      ))}
    </div>
  );
}

async function NewlyListed() {
  let items: ListingCardData[] = [];
  try {
    ({ items } = await getListingsPage({ skip: 0, take: PAGE_SIZE }));
  } catch {
    items = [];
  }
  if (items.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl">Newly listed</h2>
          <p className="text-muted text-sm">
            The latest things people have put up for sale.
          </p>
        </div>
        <Link href="/browse" className={sectionLink}>
          See all →
        </Link>
      </div>
      <NewlyListedRail items={items} />
    </section>
  );
}

function NewlyListedSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden pb-2 -mx-1 px-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="shrink-0 w-40 sm:w-48 tnt-panel p-2.5 space-y-2">
          <div className="animate-pulse rounded-lg bg-[var(--tnt-line)] aspect-square" />
          <div className="animate-pulse rounded bg-[var(--tnt-line)] h-4 w-3/4" />
          <div className="animate-pulse rounded bg-[var(--tnt-line)] h-5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * "Just in" picks up where the rail leaves off (page two of the newest
 * listings) and keeps loading pages from /api/listings as the shopper
 * scrolls. Renders nothing while the catalogue fits in the rail.
 */
async function JustIn() {
  let items: ListingCardData[] = [];
  let nextOffset: number | null = null;
  try {
    const page = await getListingsPage({ skip: PAGE_SIZE, take: PAGE_SIZE });
    items = page.items;
    nextOffset = page.total > PAGE_SIZE * 2 ? PAGE_SIZE * 2 : null;
  } catch {
    items = [];
  }
  if (items.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl">Just in</h2>
          <p className="text-muted text-sm">
            Add to cart and check out as a guest — no account needed.
          </p>
        </div>
        <Link href="/browse" className={sectionLink}>
          Browse &amp; filter →
        </Link>
      </div>
      <LoadMoreGrid initialItems={items} initialNextOffset={nextOffset} />
    </section>
  );
}

function JustInSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="tnt-panel p-3 flex flex-col gap-2.5">
          <div className="animate-pulse rounded-lg bg-[var(--tnt-line)] aspect-square" />
          <div className="animate-pulse rounded bg-[var(--tnt-line)] h-4 w-3/4" />
          <div className="animate-pulse rounded bg-[var(--tnt-line)] h-6 w-1/2" />
        </div>
      ))}
    </div>
  );
}

async function LotsTeaser() {
  const n = await countActiveLots();
  return (
    <section className="tnt-panel tnt-panel--accent p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="flex-1 space-y-1.5">
        <h2 className="text-2xl sm:text-3xl">Lots &amp; bundles</h2>
        <p className="text-sm text-[var(--tnt-ink-soft)] max-w-xl">
          {n > 0
            ? `${n === 1 ? "1 bundle" : `${n} bundles`} up for grabs right now — several things sold together as one listing, for one price.`
            : "Clearing out a shelf, a closet, or a whole collection? Sell several things together as one listing, for one price."}
        </p>
      </div>
      <div className="flex flex-wrap gap-3 shrink-0">
        {n > 0 && (
          <Link href="/browse?type=lots" className="tnt-btn">
            Shop lots
          </Link>
        )}
        <Link
          href="/sell/lot"
          className={`tnt-btn ${n > 0 ? "tnt-btn--ghost" : ""}`}
        >
          List a lot
        </Link>
      </div>
    </section>
  );
}

async function FromTheBlog() {
  let posts: {
    slug: string;
    title: string;
    excerpt: string;
    coverImageUrl: string | null;
    publishedAt: Date | null;
    createdAt: Date;
  }[] = [];
  try {
    posts = await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 3,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        coverImageUrl: true,
        publishedAt: true,
        createdAt: true,
      },
    });
  } catch {
    posts = [];
  }
  if (posts.length === 0) return null;

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl">From the blog</h2>
          <p className="text-muted text-sm">
            Selling tips, pricing know-how and what&apos;s moving right now.
          </p>
        </div>
        <Link href="/blog" className={sectionLink}>
          Read the blog →
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {posts.map((p) => {
          const cover = p.coverImageUrl || "/blog-hero-image.webp";
          return (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="tnt-card overflow-hidden !text-ink flex flex-col"
            >
              <div className="relative aspect-[16/10] bg-[var(--tnt-surface)]">
                <Image
                  src={cover}
                  alt={p.title}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover"
                  unoptimized={!canOptimizeImage(cover)}
                />
              </div>
              <div className="p-4 space-y-1.5">
                <p className="text-xs text-muted">
                  {fmtDate(p.publishedAt ?? p.createdAt)}
                </p>
                <h3 className="text-base leading-snug line-clamp-2">
                  {p.title}
                </h3>
                <p className="text-sm text-muted line-clamp-2">{p.excerpt}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ── Static sections ──────────────────────────────────────────────

const STEPS: {
  title: string;
  body: React.ReactNode;
  Icon: (props: { className?: string }) => React.ReactElement;
}[] = [
  {
    title: "List it in minutes",
    body: "Snap a few photos, pick a category, set your price. Listing is free, and you can sell one thing or a whole lot at once.",
    Icon: TagIcon,
  },
  {
    title: "Sell to anyone, payment held safely",
    body: "Buyers pay by card at checkout — no account needed. The money is held until the item arrives, so both sides are covered.",
    Icon: ShieldIcon,
  },
  {
    title: "Ship it, get paid on delivery",
    body: (
      <>
        Post it and add tracking. Once the buyer confirms delivery the sale
        is paid straight into your Stripe account. We keep{" "}
        {PLATFORM_FEE_LABEL}; the rest is yours.
      </>
    ),
    Icon: TruckIcon,
  },
];

function HowItWorks() {
  return (
    <section className="space-y-6">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h2 className="text-2xl sm:text-3xl">How it works</h2>
        <p className="text-muted text-sm">
          Three steps from &ldquo;I don&apos;t need this&rdquo; to money in the
          bank.
        </p>
      </div>
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="tnt-panel p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="tnt-step tnt-step--active" aria-hidden>
                {i + 1}
              </span>
              <s.Icon className="h-10 w-10" />
            </div>
            <h3 className="text-lg leading-snug">{s.title}</h3>
            <p className="text-sm text-muted leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Home() {
  // Opportunistic, throttled, fire-and-forget housekeeping — the storefront is
  // the busiest page, so triggering here is what makes a missed Stripe webhook
  // resolve in minutes and the one-time "list your first item" nudge go out.
  sweepFirstListingNudges();
  sweepAbandonedReservations();

  return (
    <div className="space-y-14 sm:space-y-20">
      {/* Hero — static, so it paints and hydrates before any query resolves. */}
      <section className="tnt-hero px-5 py-10 sm:px-10 sm:py-16 text-center space-y-6">
        <p className="tnt-badge tnt-sticker mx-auto relative">
          Free to list · {PLATFORM_FEE_LABEL} when it sells
        </p>
        <h1 className="relative text-4xl sm:text-6xl lg:text-7xl text-balance !text-white leading-[1.05]">
          <span className="tnt-neon-pink">Sell what you have.</span>
          <br />
          <span className="tnt-neon-green">Find what you need.</span>
        </h1>
        <p className="relative text-lg sm:text-xl text-white/85 max-w-xl mx-auto text-balance font-semibold">
          A marketplace for everything you&apos;re done with — and everything
          you&apos;re after.
        </p>
        <form
          action="/browse"
          method="get"
          role="search"
          className="relative flex gap-2 max-w-xl mx-auto"
        >
          <label htmlFor="home-search" className="sr-only">
            Search listings
          </label>
          <input
            id="home-search"
            name="q"
            type="search"
            placeholder="Search for anything — a denim jacket, a camera, a print…"
            className="tnt-input"
          />
          <button type="submit" className="tnt-btn tnt-btn--green shrink-0 !px-5">
            Search
          </button>
        </form>
        <div className="relative flex flex-wrap justify-center gap-3">
          <Link href="/browse" className="tnt-btn tnt-btn--ghost">
            Browse everything
          </Link>
          <Link href="/sell" className="tnt-btn">
            Start selling
          </Link>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl">Shop by category</h2>
            <p className="text-muted text-sm">
              Apparel to electronics, art to trading cards — if someone&apos;s
              done with it, it&apos;s here.
            </p>
          </div>
          <Link href="/browse" className={sectionLink}>
            All listings →
          </Link>
        </div>
        <Suspense fallback={<CategoryTilesSkeleton />}>
          <CategoryTiles />
        </Suspense>
      </section>

      <Suspense fallback={<NewlyListedSkeleton />}>
        <NewlyListed />
      </Suspense>

      <Suspense fallback={<JustInSkeleton />}>
        <JustIn />
      </Suspense>

      <Suspense fallback={null}>
        <LotsTeaser />
      </Suspense>

      <HowItWorks />

      <Suspense fallback={null}>
        <FromTheBlog />
      </Suspense>

      <section className="tnt-stats px-6 py-10 sm:py-14 text-center space-y-4">
        <h2 className="text-3xl sm:text-4xl !text-white">
          Got something to sell?
        </h2>
        <p className="text-white/80 max-w-xl mx-auto">
          Open a free {SITE_NAME} account, link Stripe once, and your first
          listing can be live before the kettle boils.
        </p>
        <div className="pt-2">
          <Link href="/sell" className="tnt-btn">
            List an item
          </Link>
        </div>
      </section>
    </div>
  );
}
