import type { Metadata } from "next";
import { jsonLdScript } from "@/lib/jsonLd";
import { Suspense } from "react";
import { SoldTicker } from "@/components/SoldTicker";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { ListingCard } from "@/components/ListingCard";
import { LoadMoreGrid } from "@/components/LoadMoreGrid";
import { NewlyListedRail } from "@/components/NewlyListedRail";
import { realPhotoWhere } from "@/lib/photos";
import {
  getBeanieGroupsPage,
  countActiveLots,
  sweepAbandonedReservations,
  type BeanieOption,
} from "@/lib/listings";
import {
  HeartTagIcon,
  PeaceIcon,
  CoinIcon,
  BasketIcon,
} from "@/components/BrandIcons";
import { sweepFirstListingNudges } from "@/lib/nudges";
import { SHOP_COLLECTIONS, collectionHref } from "@/lib/collections";
import { outboundHref } from "@/lib/outbound";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BeanieXchange — Buy, Sell & Authenticate Your Beanie Babies",
  description:
    "BeanieXchange is the world's resource to buy, sell, trade, and authenticate Beanie Babies. Look up what your Beanie Baby is worth in our free value database, shop escrow-protected listings, and connect with collectors.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "BeanieXchange — Buy, Sell & Authenticate Your Beanie Babies",
    description:
      "The world's resource for Beanie Baby collectors. Escrow-protected marketplace, professional authentication, and a free value database.",
    url: "/",
  },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "How does Beanie Baby authentication work on BeanieXchange?",
    a: "Sellers can list a Beanie Baby with a pre-issued True Blue Certificate of Authenticity, with a third-party COA we display on the listing, or by submitting the item for authentication through our True Blue Beans partnership. Every sale is escrow-protected, with funds released only when the buyer confirms receipt.",
  },
  {
    q: "What is a True Blue Certificate?",
    a: "True Blue Beans is a long-running third-party Beanie Baby authentication service and our authentication partner. A True Blue cert is a recognized indicator that a vintage Beanie Baby has been examined and accepted as genuine. We honor current True Blue certs, display the cert ID on the listing, and let buyers filter to True Blue verified items.",
  },
  {
    q: "How do I authenticate a Beanie Baby?",
    a: "To authenticate a Beanie Baby, an expert examines the swing and tush tags, tag generation, embroidery, fabric, fill, and known counterfeit and error markers to confirm it is a genuine Ty Beanie Baby. On BeanieXchange you can submit a Beanie for authentication through our True Blue Beans partnership — $18 per beanie, with return shipping calculated per order — and each authenticated item is sealed with a numbered Certificate of Authenticity and a permanent BX Registry number that proves its value to buyers.",
  },
  {
    q: "How does escrow protect me when I buy a Beanie Baby?",
    a: "When you check out, your payment is authorized through Stripe but not captured. Funds release to the seller only after you confirm receipt of an undamaged, authentic item. If a Beanie fails authentication or arrives misrepresented, the authorization is canceled and you are not charged.",
  },
  {
    q: "Can I sell a rare Beanie Baby like Princess Diana or the Original 9?",
    a: "Yes. BeanieXchange is built for vintage and rare Beanie Babies — Princess (the 1997 Diana bear), the Original 9 of 1993, Peanut the royal blue elephant, the wingless Quackers, and other high-value pieces. Higher-value listings benefit most from full authentication and a BX Registry number.",
  },
  {
    q: "How much is my Beanie Baby worth?",
    a: "Start with three things: the name on the swing tag, the tag generation, and the condition of both the plush and its tags. Look your beanie up in the free BeanieXchange database for a grounded value range, then compare against recent sold listings. If the range is promising, professional authentication turns an estimate into a provable value — authenticated Beanie Babies consistently sell faster and for more.",
  },
  {
    q: "How much are Beanie Babies worth?",
    a: "Most common Beanie Babies sell for about $5–$15, while genuinely rare and retired pieces in excellent condition with a clean swing tag can bring anywhere from $50 to several thousand dollars. Value comes down to rarity, tag generation, condition, and verified authenticity — not the inflated 'asking' prices you see online. Use our free Beanie Baby database to look up estimated values by name, and remember that real worth is whatever an authenticated example actually sells for.",
  },
  {
    q: "How do I trade Beanie Babies on BeanieXchange?",
    a: "BeanieXchange makes it easy to buy and sell Beanie Babies in a trusted marketplace. List a Beanie in minutes, set your price or accept offers, and every sale is escrow-protected so funds release only when the buyer confirms an authentic item. Whether you're trading duplicates, downsizing a collection, or hunting your grails, you're trading with a verified Beanie Baby community.",
  },
  {
    q: "Where can I sell my Beanie Babies?",
    a: "The best place to sell Beanie Babies is a trusted marketplace built for collectors like BeanieXchange. List a Beanie in minutes, set your price or accept offers, and reach buyers who are actively searching for vintage and rare Ty Beanie Babies. Every sale is escrow-protected, so funds release only when the buyer confirms an authentic item — and authenticated Beanie Babies with a Certificate of Authenticity and a BX Registry number consistently sell faster and for more.",
  },
  {
    q: "What is Beanie Baby grading and authentication?",
    a: "Beanie Baby authentication is a professional examination of tags, embroidery, fabric, fill, and known counterfeit markers to confirm an item is genuine. Grading then assigns a condition score and seals the Beanie with a numbered Certificate of Authenticity and a permanent BX Registry number. On BeanieXchange, authentication is offered through our True Blue Beans partnership — $18 per beanie, with return shipping calculated per order.",
  },
  {
    q: "Is there a Beanie Baby collectors community?",
    a: "Yes — BeanieXchange is a marketplace and a community for Beanie Baby collectors. Join the forums to ask questions, show off your collection, compare values, and connect with fellow collectors who share your passion for vintage Ty Beanie Babies.",
  },
];

// The six database/community entry points surfaced in the hero. Earlier
// designs painted these into the artwork and overlaid invisible hotspots;
// they are now real rendered buttons overlaid on the image, colored to
// match the header nav's sticker palette.
const HERO_LINKS: { label: string; href: string; bg: string; fg: string }[] = [
  { label: "Browse All Beanies", href: "/database", bg: "var(--tnt-blue-bright)", fg: "var(--tnt-ink)" },
  { label: "Search & Filter", href: "/database", bg: "var(--tnt-green-bright)", fg: "var(--tnt-ink)" },
  { label: "Chronological Order", href: "/database?sort=year", bg: "var(--tnt-yellow)", fg: "var(--tnt-ink)" },
  { label: "View Details & Images", href: "/browse", bg: "var(--tnt-pink)", fg: "#fff" },
  { label: "Rarity & Value Insights", href: "/rarity-guide", bg: "var(--tnt-purple-bright)", fg: "#fff" },
  { label: "Join the Community", href: "/forum", bg: "var(--tnt-red)", fg: "#fff" },
];

/** Fisher–Yates shuffle (non-mutating). */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The hero and marketing content are fully static, so Home renders without
 * touching the database and streams (and hydrates) immediately — the DB-backed
 * grids below live in their own Suspense boundaries and fill in as data
 * arrives. When the whole page awaited these queries, the hero sat painted
 * but un-hydrated for seconds and its CTA silently swallowed clicks.
 */
async function FeaturedGrid() {
  // Opportunistic, throttled (1/hour per instance), fire-and-forget: mails the
  // one-time "list your first beanie" nudge to accounts that never listed.
  // Same self-triggering pattern as sweepAbandonedReservations() below — no
  // external scheduler and no shared secret to configure.
  sweepFirstListingNudges();
  // Same deal, throttled to 1/5min per instance: free abandoned reservations
  // and advance orders Stripe authorized but whose webhook never landed. It
  // ran only on /browse and /api/checkout, and neither covers the case that
  // matters most — a buyer who paid and closed the tab. The storefront is the
  // busiest page on the site, so triggering here is what makes a missed
  // webhook resolve in minutes rather than whenever someone browses next.
  sweepAbandonedReservations();

  let featured: Awaited<ReturnType<typeof prisma.listing.findMany>> = [];
  try {
    // Feature real-photo listings only — the homepage is the storefront, so
    // it should never lead with placeholder listings. Pull a recent pool with
    // each seller's role so community sellers can be prioritised.
    let pool = await prisma.listing.findMany({
      // Lots have their own storefront view — the single-beanie rails exclude
      // them so a bundle never renders as a lone card at its whole-lot price.
      where: {
        status: "ACTIVE",
        quantity: { gt: 0 },
        isLot: false,
        ...realPhotoWhere,
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { seller: { select: { role: true } } },
    });
    // Fallback for a brand-new catalogue with no real photos yet.
    if (pool.length === 0) {
      pool = await prisma.listing.findMany({
        where: { status: "ACTIVE", isLot: false },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { seller: { select: { role: true } } },
      });
    }
    // Community (non-admin) sellers come first, then house/admin listings fill
    // the remaining slots — each group in random order, fresh every render.
    const community = shuffle(pool.filter((l) => l.seller.role !== "ADMIN"));
    const house = shuffle(pool.filter((l) => l.seller.role === "ADMIN"));
    featured = [...community, ...house].slice(0, 5);
  } catch {
    featured = [];
  }

  if (featured.length === 0) {
    return (
      <div className="tnt-panel p-10 text-center text-muted">
        No listings yet — be the first to{" "}
        <Link href="/sell" className="!text-[var(--tnt-red)] font-semibold">
          list a Beanie Baby
        </Link>
        .
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {featured.map((l) => (
        <ListingCard key={l.id} listing={l} />
      ))}
    </div>
  );
}

/**
 * "Newly Listed" carousel: the freshest ACTIVE listings in a horizontal
 * scroll-snap row. Each photo wears a TEMPORARY "NEW LISTING" ribbon frame —
 * to retire the promo, drop the ribbon <span> and the red border classes.
 */
async function NewlyListedCarousel() {
  let latest: {
    id: string;
    title: string;
    priceCents: number;
    photos: string[];
  }[] = [];
  try {
    latest = await prisma.listing.findMany({
      // Lots surface in their own view, not the single-beanie "Newly Listed" rail.
      where: { status: "ACTIVE", quantity: { gt: 0 }, isLot: false },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, title: true, priceCents: true, photos: true },
    });
  } catch {
    latest = [];
  }
  if (latest.length === 0) return null;

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl sm:text-3xl font-bold">Newly Listed</h2>
        <Link href="/browse" className="text-sm font-semibold !text-[var(--tnt-red)]">
          See all →
        </Link>
      </div>
      <NewlyListedRail items={latest} />
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
 * "Shop Collections" tile rail: static, curated entry points into the
 * marketplace (each tile deep-links to /browse?collection=…). Sits directly
 * under the hero so shoppers can jump straight to the corner of the hobby
 * they collect.
 */
function ShopCollections() {
  return (
    <section className="space-y-5">
      <div className="text-center max-w-3xl mx-auto space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold">Shop Collections</h2>
        <p className="text-muted text-sm sm:text-base">
          Jump straight to the Beanie Babies you collect — classic Ty bears,
          the 1993 Original 9, rare and retired grails, and every furry,
          feathered, and finned friend in between. Every listing is
          escrow-protected and backed by real authentication.
        </p>
      </div>
      {/* Card artwork carries its own baked-in title + tagline, so the tile
          is just the image — the only text in the markup is the fallback
          layer below, which the artwork covers. 3-across on desktop (2 on
          phones), each card wearing its collection's sticker-palette accent
          border like the header nav pills. That tint border is the card's
          only frame: the artwork's own baked-in rounded border was repainted
          out of the PNGs so it can't show through as a grey inner border. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
        {SHOP_COLLECTIONS.map((c) => (
          <Link
            key={c.key}
            href={collectionHref(c)}
            // aspect-square keeps the row height uniform — the card files
            // vary a few percent (448–469px tall), and letterboxing onto the
            // tile is invisible while object-cover would clip the baked-in
            // captions. The tile fill matches the artwork's cream field
            // (#fefaf1) rather than white, so those letterbox strips don't
            // read as a pale second border inside the tint one.
            className="relative block aspect-square overflow-hidden rounded-2xl border-[3px] shadow-[0_3px_0_var(--tnt-ink)] hover:-translate-y-1 hover:shadow-[var(--tnt-shadow-lg)] transition-all bg-[#fefaf1]"
            style={{ borderColor: c.tint }}
          >
            {/* The artwork is the card's ONLY title + tagline, so a tile
                whose image is still in flight — or that fails to fetch —
                renders as a blank cream square with nothing in it. This
                text layer sits underneath as the fallback; the opaque
                artwork paints straight over it, and the ≤5% letterbox
                strips (448–469px art on a square tile) never reach the
                centred text. aria-hidden because the image alt already
                says the same thing to a screen reader. */}
            <span
              aria-hidden
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center"
            >
              <span className="font-bold text-base sm:text-lg leading-tight">
                {c.label}
              </span>
              <span className="text-muted text-xs sm:text-sm leading-snug">
                {c.tagline}
              </span>
            </span>
            <Image
              src={c.image}
              alt={c.imageAlt}
              fill
              sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 380px"
              className="object-contain"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * "From the Blog" carousel: the freshest published posts in a horizontal
 * scroll-snap row of thumbnail cards. Posts without a cover image fall back
 * to the blog hero artwork so the rail never shows an empty frame.
 */
async function RecentBlogPosts() {
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
      take: 8,
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
          <h2 className="text-2xl sm:text-3xl font-bold">From the Blog</h2>
          <p className="text-muted text-sm">
            Value guides, authentication tips, rare finds, and collecting
            know-how from the BeanieXchange team.
          </p>
        </div>
        <Link
          href="/blog"
          className="hidden sm:inline text-sm font-semibold !text-[var(--tnt-red)] shrink-0"
        >
          Read the blog →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {posts.map((p) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="snap-start shrink-0 w-60 sm:w-72 tnt-panel overflow-hidden !text-ink hover:shadow-[var(--tnt-shadow-lg)] transition-shadow"
          >
            <div className="relative aspect-[16/10] bg-[var(--tnt-surface)]">
              <Image
                src={p.coverImageUrl || "/blog-hero-image.webp"}
                alt={p.title}
                fill
                sizes="288px"
                className="object-cover"
              />
            </div>
            <div className="p-4 space-y-1.5">
              <p className="text-xs text-muted">
                {fmtDate(p.publishedAt ?? p.createdAt)}
              </p>
              <h3 className="text-sm font-bold leading-snug line-clamp-2">
                {p.title}
              </h3>
              <p className="text-xs text-muted line-clamp-2">{p.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>
      <div className="sm:hidden text-center">
        <Link href="/blog" className="text-sm font-semibold !text-[var(--tnt-red)]">
          Read the blog →
        </Link>
      </div>
    </section>
  );
}

function FeaturedGridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="tnt-panel p-3 flex flex-col gap-2.5">
          <div className="animate-pulse rounded-lg bg-[var(--tnt-line)] aspect-square" />
          <div className="animate-pulse rounded bg-[var(--tnt-line)] h-4 w-3/4" />
          <div className="animate-pulse rounded bg-[var(--tnt-line)] h-6 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * "Shop" grid: active listings grouped by beanie (price range + option
 * count), real-photo beanies first, paged 12 at a time (continued
 * client-side via /api/listings). Renders nothing on an empty catalogue,
 * so it streams in as a whole section.
 */
async function ShopSection() {
  const SHOP_PAGE = 12;
  let shopItems: BeanieOption[] = [];
  let shopNextOffset: number | null = null;
  try {
    const { items, total } = await getBeanieGroupsPage({
      skip: 0,
      take: SHOP_PAGE,
    });
    shopItems = items;
    shopNextOffset = total > SHOP_PAGE ? SHOP_PAGE : null;
  } catch {
    shopItems = [];
  }
  if (shopItems.length === 0) return null;

  const lotCount = await countActiveLots();

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold">
            Shop Beanie Babies
          </h2>
          <p className="text-muted text-sm">
            Every listing is escrow-protected. Add to cart and check out as a
            guest — no account needed.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-4 shrink-0">
          {lotCount > 0 && (
            <Link
              href="/browse?type=lots"
              className="text-sm font-semibold !text-[var(--tnt-purple-text)]"
            >
              🎁 Shop Lots →
            </Link>
          )}
          <Link
            href="/browse"
            className="text-sm font-semibold !text-[var(--tnt-red)]"
          >
            Browse &amp; filter →
          </Link>
        </div>
      </div>
      <LoadMoreGrid
        initialItems={shopItems}
        initialNextOffset={shopNextOffset}
      />
    </section>
  );
}

export default function Home() {

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  // Structured data for the Shop Collections rail: an ItemList of the curated
  // collection pages so search engines can surface them as sitelinks.
  const collectionsLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Shop Beanie Baby Collections",
    itemListElement: SHOP_COLLECTIONS.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      description: c.blurb,
      url: `https://beaniexchange.com${collectionHref(c)}`,
    })),
  };

  const about = [
    {
      title: "What Are Beanie Babies?",
      color: "var(--tnt-red)",
      bg: "var(--tnt-red-soft)",
      cta: "Explore the Beanie Baby database",
      href: "/database",
      body: (
        <>
          Ty <strong>Beanie Babies</strong>{" "}launched in 1993 with the
          Original&nbsp;9 and became the defining collectible plush of the
          1990s. Vintage and <strong>retired Beanie Babies</strong>{" "}— from
          Princess the Diana bear to the royal-blue Peanut elephant — are still
          actively collected today. A beanie&apos;s story lives in its swing
          tag, tag generation, fabric, and condition, and BeanieXchange helps
          you read, value, and verify every detail.
        </>
      ),
    },
    {
      title: "Buy & Sell Beanie Babies",
      color: "var(--tnt-green)",
      bg: "var(--tnt-green-soft)",
      cta: "Browse the marketplace",
      href: "/browse",
      body: (
        <>
          Our marketplace makes it easy to <strong>buy Beanie Babies</strong>{" "}
          from people who know the hobby — and to{" "}
          <strong>sell Beanie Babies</strong>{" "}to buyers who pay what
          they&apos;re really worth. Every purchase is escrow-protected, with
          funds released only once the buyer confirms the item arrived as
          described, and the seller fee is a flat 10%. List a Ty Beanie Baby in
          minutes as authenticated, COA-backed, or honestly sold as-is.
        </>
      ),
    },
    {
      title: "Trade Beanie Babies",
      color: "var(--tnt-blue)",
      bg: "#e6f4ff",
      cta: "Meet the community",
      href: "/forum",
      body: (
        <>
          BeanieXchange is a true <strong>Beanie Baby Exchange</strong>, not
          just a store. Make and counter offers to{" "}
          <strong>trade Beanie Babies</strong>{" "}with collectors at prices
          both sides agree on. Sell your duplicates, finish a set, or upgrade
          condition — all on transparent terms, with a community that
          genuinely gets the hobby.
        </>
      ),
    },
    {
      title: "Beanie Baby Authentication & Grading",
      color: "var(--tnt-purple)",
      bg: "#ede9fe",
      cta: "Authenticate & grade your beanies",
      href: "/authenticate",
      body: (
        <>
          Real value starts with proof. Our{" "}
          <strong>Beanie Baby authentication</strong>{" "}examines swing and tush
          tags, tag generation, embroidery, fabric, fill, and known counterfeit
          markers, then seals each item with a numbered Certificate of
          Authenticity and a permanent BX Registry number. Choose in-house{" "}
          <strong>BX Authentication</strong>{" "}($5/beanie + shipping to us,
          return shipping included)
          or our True Blue Beans partner — authenticated beanies sell faster and
          for more.
        </>
      ),
    },
    {
      title: "Track Beanie Baby Values",
      color: "var(--tnt-pink)",
      bg: "#ffe6f1",
      cta: "Look up Beanie Baby values",
      href: "/database",
      body: (
        <>
          Wondering how much your <strong>Beanie Babies</strong>{" "}are worth?
          Skip the inflated &ldquo;asking&rdquo; prices and look up grounded
          estimates in our free, searchable{" "}
          <strong>Beanie Baby database</strong>{" "}— hundreds of Ty Beanie Babies
          with value ranges, style numbers, and rarity notes. Learn what truly
          drives value: rarity, tag generation, condition, and verified
          authenticity.
        </>
      ),
    },
    // Verify-cert / BX Registry card — disabled with in-house authentication:
    // {
    //   title: "The BX Registry & Collector Community",
    //   color: "#b7791f",
    //   bg: "#fdf3d3",
    //   cta: "Visit the BX Registry",
    //   href: "/registry",
    //   body: (
    //     <>
    //       Every authenticated Beanie Baby earns a place in the public BX
    //       Registry — a permanent, verifiable record of authenticity, grade,
    //       and provenance that follows the item from one collector to the
    //       next. Together with our forums, collection showcases, and rarity
    //       guides, BeanieXchange is where the <strong>Beanie Baby</strong>
    //       {" "}community comes to buy, sell, trade, learn, and connect.
    //     </>
    //   ),
    // },
  ];

  return (
    <div className="space-y-12 sm:space-y-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionsLd) }}
      />

      {/* Live sold-price ticker (renders only once eBay data is ingested). */}
      <Suspense fallback={null}>
        <SoldTicker />
      </Suspense>

      {/* ─── HERO: the July 2026 bear-lineup artwork. The image carries no
             painted controls — the search bar and feature buttons are real
             components in the band beneath it, so they work identically at
             every viewport size. The search form is a plain GET to
             /database?q=, which the database page already deep-links. ── */}
      <section className="pt-2">
        {/* Everything lives ON the artwork: the image is a cover background,
            a top+bottom scrim keeps text legible, and the search band that
            used to sit in a white strip below is overlaid transparent at the
            bottom. A flex spacer in the middle keeps the bears visible. */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--tnt-ink)] shadow-[var(--tnt-shadow)]">
          <Image
            src="/hero-bears-july-2026.webp"
            alt="A lineup of classic Ty Beanie Babies — Princess, Peace, the Original 9-era bears, and more — beneath the Ty heart logo and a rainbow"
            fill
            priority
            sizes="(max-width:1024px) 100vw, 72rem"
            className="object-cover object-center"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/25"
          />
          <div className="relative flex flex-col items-center text-center gap-2.5 px-4 sm:px-8 pt-6 sm:pt-9 pb-5 sm:pb-8 min-h-[30rem] sm:min-h-[38rem] lg:min-h-[44rem]">
            <Image
              src="/brand/tnt-heart-logo-v3.png"
              alt="BX heart logo"
              width={512}
              height={512}
              className="h-14 w-14 sm:h-20 sm:w-20 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
            />
            <h1 className="font-display !text-white text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
              Welcome to BeanieXchange!
            </h1>
            <p className="font-display !text-white text-xs sm:text-lg lg:text-xl font-semibold drop-shadow-[0_1px_5px_rgba(0,0,0,0.8)]">
              The world&apos;s resource to Buy, Sell, Trade &amp; Authenticate
              Beanie Babies!
            </p>

            {/* spacer — lets the bear lineup show through */}
            <div className="flex-1 min-h-16 sm:min-h-24" aria-hidden />

            <h2 className="font-display !text-white text-xl sm:text-3xl font-bold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
              The Home for Beanie Baby Collectors
            </h2>
            <p className="!text-white/90 text-xs sm:text-sm font-semibold tracking-wide drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
              Collect. Learn. Trade. Connect.
            </p>
            <form
              action="/database"
              method="get"
              className="mx-auto flex w-full max-w-2xl gap-2 pt-1"
            >
              <input
                type="search"
                name="q"
                placeholder="Search the Beanie Database — name, animal, or category…"
                aria-label="Search the Beanie Database"
                className="tnt-input !bg-white"
              />
              <button type="submit" className="tnt-btn shrink-0">
                Search
              </button>
            </form>
            <div className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
              {HERO_LINKS.map((h) => (
                <Link
                  key={h.label}
                  href={h.href}
                  style={{ background: h.bg, color: h.fg }}
                  className="flex items-center justify-center rounded-full border-2 border-[var(--tnt-ink)] px-3 py-2.5 text-center font-display text-xs font-bold shadow-[0_2px_0_var(--tnt-ink)] hover:-translate-y-0.5 transition-transform"
                >
                  {h.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── ABOUT (SEO) — sits directly under the hero ───────── */}
      <section
        aria-labelledby="about-heading"
        className="space-y-4 text-center"
      >
        <h2
          id="about-heading"
          className="text-2xl sm:text-3xl font-bold text-center"
        >
          About BeanieExchange
        </h2>
        <p className="text-muted leading-relaxed">
          BeanieExchange is the trusted destination to buy, sell, trade, value,
          and authenticate Beanie Babies. Whether you&rsquo;re wondering how much
          your Beanie Baby is worth, looking for the best place to sell Beanie
          Babies, searching for valuable or rare Ty Beanie Babies, or trying to
          determine if your Beanie Baby is authentic, our growing database and
          marketplace make it easy. Explore current Beanie Baby values, discover
          collectible and investment-grade Ty Beanie Babies, compare listings,
          learn how to identify authentic tags and errors, and connect with
          collectors who share your passion.
        </p>
        <p className="text-muted leading-relaxed">
          If you&rsquo;ve ever asked{" "}
          <strong className="text-ink font-semibold">
            &ldquo;Where can I sell my Beanie Babies?&rdquo;
          </strong>
          ,{" "}
          <strong className="text-ink font-semibold">
            &ldquo;How much is my Beanie Baby worth?&rdquo;
          </strong>
          , or{" "}
          <strong className="text-ink font-semibold">
            &ldquo;How do I authenticate a Beanie Baby?&rdquo;
          </strong>
          , BeanieExchange is your complete resource for buying, selling,
          trading, valuing, and authenticating Beanie Babies.
        </p>
      </section>

      {/* ─── SHOP COLLECTIONS (tile rail) ─────────────────────── */}
      <ShopCollections />

      {/* ─── NEWLY LISTED (carousel) ──────────────────────────── */}
      <Suspense fallback={<NewlyListedSkeleton />}>
        <NewlyListedCarousel />
      </Suspense>

      {/* ─── AUTH PROMO BANNER (centered) ─────────────────────── */}
      <section className="tnt-auth-banner rounded-2xl p-8 sm:p-12 text-center">
        <div className="mx-auto max-w-2xl flex flex-col items-center gap-5">
          <Image
            src="/brand/tnt-heart-logo-v3.png"
            alt="Beanie Xchange"
            width={512}
            height={512}
            className="h-20 w-20 sm:h-24 sm:w-24 object-contain"
          />
          <h2 className="text-2xl sm:text-3xl font-bold">
            Get Your Beanie Baby Authenticated Today
          </h2>
          <p className="text-muted">
            Protect your collection and prove its value. Choose in-house{" "}
            <strong className="text-[var(--tnt-red)]">BX Authentication</strong>{" "}
            — $5 per beanie plus shipping to us, return shipping included — or
            our True Blue Beans
            partner. Every authenticated item gets a sealed Certificate of
            Authenticity and a permanent BX Registry number.
          </p>
          {/* Two priced options, laid out as one comparison grid: every card
              uses the same four rows (logo · name · price · note) so the
              prices line up even though the logos and copy differ in size. */}
          <div className="grid w-full max-w-lg grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 sm:gap-y-0">
            {/* BX in-house — in-app checkout */}
            <div className="space-y-1.5">
              <div className="flex h-20 items-center justify-center">
                <Image
                  src="/brand/tnt-heart-logo-v3.png"
                  alt="BX Authentication"
                  width={512}
                  height={512}
                  className="max-h-20 w-auto object-contain"
                />
              </div>
              <p className="font-bold text-[var(--tnt-red)]">BX Authentication</p>
              <p className="text-3xl font-extrabold">
                $5<span className="text-base font-semibold text-muted">/beanie</span>
              </p>
              <p className="text-xs text-pretty text-muted">
                In-house. Returned heat-sealed with a numbered “BX Authentic”
                token and a COA. Ship to us; return shipping included.
              </p>
            </div>
            {/* True Blue — third-party partner */}
            <div className="space-y-1.5">
              <div className="flex h-20 items-center justify-center">
                <Image
                  src="/brand/true-blue-beans.png"
                  alt="True Blue Beans Authentication Service"
                  width={2000}
                  height={716}
                  className="max-h-14 w-auto object-contain"
                />
              </div>
              <p className="font-bold text-[var(--tnt-blue)]">True Blue Beans</p>
              <p className="text-3xl font-extrabold">
                $18<span className="text-base font-semibold text-muted">/beanie</span>
              </p>
              <p className="text-xs text-pretty text-muted">
                Third-party partner. Sealed with a True Blue certificate.
                Return shipping calculated per order.
              </p>
            </div>
          </div>
        </div>
        {/* Outside the max-w-2xl copy column so the three CTAs share
            one row on desktop instead of orphaning the last one. */}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/authenticate/bx" className="tnt-btn">
            Start BX Authentication →
          </Link>
          {/* Tracked egress straight to True Blue's packages page —
              /out/true-blue records the click, then 302s. */}
          <a
            href={outboundHref("true-blue", "home-auth-banner")}
            target="_blank"
            rel="noopener noreferrer external"
            className="tnt-btn tnt-btn--ghost"
          >
            Submit to True Blue ↗
          </a>
          <Link href="/authentication-process" className="tnt-btn tnt-btn--ghost">
            How it works
          </Link>
        </div>
      </section>

      {/* ─── FEATURED LISTINGS ────────────────────────────────── */}
      <section className="space-y-5">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl sm:text-3xl font-bold">Featured Listings</h2>
          <Link
            href="/browse"
            className="text-sm font-semibold !text-[var(--tnt-red)]"
          >
            View all listings →
          </Link>
        </div>
        <Suspense fallback={<FeaturedGridSkeleton />}>
          <FeaturedGrid />
        </Suspense>
      </section>

      {/* ─── FEATURE CARDS ────────────────────────────────────── */}
      <section className="space-y-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">
          Everything You Need to Collect with Confidence
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            {
              Icon: BasketIcon,
              tint: "var(--tnt-green)",
              bg: "var(--tnt-green-soft)",
              title: "Shop the Marketplace",
              body: "Thousands of authenticated beanies — buy now or add to cart.",
              cta: "Shop Now",
              href: "/browse",
              ctaColor: "var(--tnt-green)",
            },
            {
              Icon: HeartTagIcon,
              tint: "var(--tnt-red)",
              bg: "var(--tnt-red-soft)",
              title: "Authenticate & Grade",
              body: "Professional authentication and grading you can trust.",
              cta: "Learn More",
              href: "/authenticate",
              ctaColor: "var(--tnt-red)",
            },
            {
              Icon: PeaceIcon,
              tint: "var(--tnt-purple)",
              bg: "#ede9fe",
              title: "Community",
              body: "Connect, share, and grow your collection together.",
              cta: "Join the Community",
              href: "/forum",
              ctaColor: "var(--tnt-purple)",
            },
          ].map(({ Icon, tint, bg, title, body, cta, href, ctaColor }) => (
            <div
              key={title}
              className="tnt-panel p-6 flex flex-col items-center text-center gap-3 border-2"
              style={{ borderColor: tint }}
            >
              <span
                className="h-12 w-12 rounded-full flex items-center justify-center"
                style={{ background: bg }}
              >
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="text-lg font-bold" style={{ color: tint }}>
                {title}
              </h3>
              <p className="text-sm text-muted">{body}</p>
              <Link
                href={href}
                className="text-sm font-semibold mt-1"
                style={{ color: ctaColor }}
              >
                {cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ─── TRUST / FEATURE BAND ─────────────────────────────── */}
      <section className="tnt-stats px-6 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
        {[
          { Icon: BasketIcon, stat: "Escrow", label: "On Every Sale" },
          { Icon: HeartTagIcon, stat: "2 Tiers", label: "Authentication" },
          { Icon: PeaceIcon, stat: "Public", label: "BX Registry" },
          { Icon: CoinIcon, stat: "10% Flat", label: "Seller Fee" },
        ].map(({ Icon, stat, label }) => (
          <div key={label} className="flex flex-col items-center gap-1.5">
            <Icon className="h-7 w-7" />
            <p className="text-2xl font-extrabold text-white">{stat}</p>
            <p className="text-xs text-white/70">{label}</p>
          </div>
        ))}
      </section>

      {/* ─── RECENT BLOG POSTS (carousel) ─────────────────────── */}
      <Suspense fallback={null}>
        <RecentBlogPosts />
      </Suspense>

      {/* ─── SHOP GRID (keep-scrolling storefront) ────────────── */}
      <Suspense fallback={null}>
        <ShopSection />
      </Suspense>

      {/* ─── COMMUNITY PILLS ──────────────────────────────────── */}
      <section className="space-y-5 text-center">
        <Image
          src="/rainbow-bear.png"
          alt="BeanieXchange — Trade, Collect, Connect"
          width={600}
          height={900}
          className="mx-auto w-40 h-auto"
        />
        <h2 className="text-2xl sm:text-3xl font-bold">
          Join a Community That Gets It
        </h2>
        <p className="text-muted">
          From new collectors to longtime experts — everyone is welcome.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-1">
          {[
            { label: "Discussion Forums", href: "/forum" },
            { label: "Collection Showcases", href: "/forum/show-and-tell" },
            { label: "Collector Events", href: "/forum" },
            { label: "Tips & Resources", href: "/rarity-guide" },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="tnt-panel px-5 py-3 text-sm font-semibold hover:border-[var(--tnt-muted)] !text-ink"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      {/* ─── BUY / SELL / TRADE / AUTHENTICATE (SEO) ──────────── */}
      <section className="space-y-8">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <h2 className="text-2xl sm:text-3xl font-bold">
            Buy, Sell, Trade &amp; Authenticate Beanie Babies
          </h2>
          <p className="text-[var(--tnt-ink-soft)] leading-relaxed">
            BeanieXchange is the world&apos;s resource for everything Beanie
            Babies — one place to <strong>buy Beanie Babies</strong> from
            trusted collectors, <strong>sell Beanie Babies</strong> to buyers
            who know their value, <strong>trade Beanie Babies</strong> with a
            community that gets the hobby, and{" "}
            <strong>authenticate Beanie Babies</strong> so every deal is
            backed by proof.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[
            {
              title: "Buy Beanie Babies",
              color: "var(--tnt-green)",
              cta: "Shop the marketplace",
              href: "/browse",
              body: "Shop authenticated Ty Beanie Babies with escrow protection on every order — your payment isn't released until you confirm the beanie arrived genuine and as described. Browse curated collections, filter by authentication, and buy from real collectors, not bulk resellers.",
            },
            {
              title: "Sell Beanie Babies",
              color: "var(--tnt-red)",
              cta: "List a beanie in minutes",
              href: "/sell",
              body: "Sell Beanie Babies to buyers who actually pay collector prices. List in minutes with a flat 10% seller fee — no listing fees, no surprises. Authenticated listings stand out, sell faster, and command more, and our value database helps you price with confidence.",
            },
            {
              title: "Trade Beanie Babies",
              color: "var(--tnt-blue)",
              cta: "Make an offer",
              href: "/browse",
              body: "More than a store — BeanieXchange is a true exchange. Make and counter offers to trade Beanie Babies with collectors at prices both sides agree on. Sell your duplicates, complete a set, or upgrade condition on transparent terms.",
            },
            {
              title: "Authenticate Beanie Babies",
              color: "var(--tnt-purple)",
              cta: "Start an authentication",
              href: "/authenticate",
              body: "Beanie Baby authentication through our True Blue Beans partnership examines tags, tag generation, embroidery, fabric, and known counterfeit markers — $18 per beanie, with return shipping calculated per order. Every authenticated item earns a sealed COA and a permanent BX Registry number.",
            },
          ].map(({ title, color, cta, href, body }) => (
            <div
              key={title}
              className="tnt-panel p-6 space-y-2.5 border-2"
              style={{ borderColor: color }}
            >
              <h3 className="text-lg font-bold" style={{ color }}>
                {title}
              </h3>
              <p className="text-sm text-[var(--tnt-ink-soft)] leading-relaxed">
                {body}
              </p>
              <Link
                href={href}
                className="inline-block text-sm font-semibold"
                style={{ color }}
              >
                {cta} →
              </Link>
            </div>
          ))}
        </div>
        <div className="tnt-panel p-6 sm:p-8 max-w-3xl mx-auto space-y-3">
          <h3 className="text-lg sm:text-xl font-bold">
            How much is my Beanie Baby worth?
          </h3>
          <p className="text-sm text-[var(--tnt-ink-soft)] leading-relaxed">
            It&apos;s the question every collector asks — and the honest
            answer is: it depends on rarity, tag generation, condition, and
            verified authenticity. Most common Beanie Babies are worth
            $5–$15, while rare and retired pieces with clean swing tags can
            bring $50 to several thousand dollars. To find out what{" "}
            <em>your</em> Beanie Baby is worth: look it up by name in our
            free{" "}
            <Link href="/database" className="!text-red font-semibold">
              Beanie Baby value database
            </Link>
            , check the{" "}
            <Link href="/rarity-guide" className="!text-red font-semibold">
              rarity guide
            </Link>{" "}
            to see what drives the price, and — for anything promising —{" "}
            <Link href="/authenticate" className="!text-red font-semibold">
              get it authenticated
            </Link>{" "}
            so its value is provable, not just hoped for.
          </p>
        </div>
      </section>

      {/* ─── ABOUT (SEO) ──────────────────────────────────────── */}
      <section className="space-y-8">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <h2 className="text-2xl sm:text-3xl font-bold">
            About BeanieXchange — The Beanie Baby Exchange
          </h2>
          <p className="text-[var(--tnt-ink-soft)] leading-relaxed">
            <strong>BeanieXchange</strong> is the dedicated{" "}
            <strong>Beanie Baby Exchange</strong> — a trusted online marketplace
            and collector community where you can{" "}
            <strong>buy, sell, and trade Beanie Babies</strong> with confidence.
            We pair a modern, escrow-protected marketplace with professional{" "}
            <strong>Beanie Baby authentication and grading</strong>, a public
            registry, and an active community, so every Ty Beanie Baby that
            changes hands here is backed by proof — not guesswork.
          </p>
          <p className="text-[var(--tnt-ink-soft)] leading-relaxed">
            From the height of the 1990s craze to today&apos;s collector
            market, Beanie Babies have never stopped changing hands — what
            changed is how hard it became to know what&apos;s genuine and what
            it&apos;s worth. That&apos;s the problem BeanieXchange solves.
            Shop curated collections like classic{" "}
            <strong>Ty bears</strong>, the <strong>Original 9</strong>, and
            rare retired grails; look up any beanie in our free value
            database; and read the blog for market news and collecting guides.
            Whether you&apos;re rediscovering a childhood collection or
            building a serious vintage portfolio, this is where the hobby
            lives.
          </p>
        </div>
        <div className="tnt-panel p-6 sm:p-8 max-w-3xl mx-auto text-left divide-y divide-[var(--tnt-line)]">
          {about.map(({ title, color, cta, href, body }) => (
            <div key={title} className="py-5 first:pt-0 last:pb-0 space-y-2">
              <h3 className="text-lg font-bold" style={{ color }}>
                {title}
              </h3>
              <p className="text-sm text-[var(--tnt-ink-soft)] leading-relaxed">
                {body}{" "}
                <Link
                  href={href}
                  className="font-semibold whitespace-nowrap"
                  style={{ color }}
                >
                  {cta} →
                </Link>
              </p>
            </div>
          ))}

          <div className="py-5 first:pt-0 last:pb-0 space-y-2">
            <h3 className="text-lg font-bold">
              The marketplace and community for Beanie Babies
            </h3>
            <p className="text-sm text-[var(--tnt-ink-soft)] leading-relaxed">
              BeanieXchange is the trusted place to{" "}
              <strong>buy and sell Beanie Babies</strong>{" "}online. Whether
              you&apos;re hunting the Original 9, chasing a Princess Diana bear, or
              finally cashing in a childhood collection, our marketplace connects
              you with real <strong>Beanie Baby collectors</strong> — every listing
              is escrow-protected and either True Blue verified, COA-backed, or
              authenticated in-house. List a beanie in minutes and reach buyers who
              actually know what your Ty Beanie Babies are worth.
            </p>
          </div>

          <div className="py-5 first:pt-0 last:pb-0 space-y-2">
            <h3 className="text-lg font-bold">
              Trade Beanie Babies with a community that gets it
            </h3>
            <p className="text-sm text-[var(--tnt-ink-soft)] leading-relaxed">
              More than a store, BeanieXchange is a{" "}
              <strong>Beanie Baby community</strong>. Join the forums to ask
              questions, show off your collection, swap duplicates, and compare
              notes with fellow collectors. When you&apos;re ready to{" "}
              <strong>trade Beanie Babies</strong>, our offer system and flat,
              transparent fees make it simple to deal directly with people who
              share your passion for the hobby.
            </p>
          </div>

          <div className="py-5 first:pt-0 last:pb-0 space-y-2">
            <h3 className="text-lg font-bold">
              Beanie Baby authentication &amp; grading you can trust
            </h3>
            <p className="text-sm text-[var(--tnt-ink-soft)] leading-relaxed">
              Real value starts with proof. Our{" "}
              <strong>Beanie Baby authentication</strong> and{" "}
              <strong>grading</strong> examine tag generations, embroidery, fabric,
              fill, and known counterfeit markers, then seal each item with a
              numbered Certificate of Authenticity and a permanent BX Registry
              number. Authentication is offered through our True Blue Beans
              partnership — $18 per beanie, with return shipping calculated
              per order. Authenticated beanies sell faster and for more.
            </p>
          </div>

          <div className="py-5 first:pt-0 last:pb-0 space-y-2">
            <h3 className="text-lg font-bold">How much are Beanie Babies worth?</h3>
            <p className="text-sm text-[var(--tnt-ink-soft)] leading-relaxed">
              Most Beanie Babies are common and sell for about $5–$15, but
              genuinely rare and retired pieces — in excellent condition with a
              clean swing tag — can bring $50 to several thousand dollars. Worth
              comes down to rarity, tag generation, condition, and verified
              authenticity, not the inflated &ldquo;asking&rdquo; prices floating
              around online. Look up estimated values in our free{" "}
              <Link href="/database" className="!text-red font-semibold">
                Beanie Baby database
              </Link>
              , and read our{" "}
              <Link href="/beanie-info" className="!text-red font-semibold">
                Beanie Info guide
              </Link>{" "}
              to learn what actually drives value.
            </p>
          </div>
        </div>
      </section>

      {/* ─── FAQ (SEO) ────────────────────────────────────────── */}
      <section className="space-y-4 max-w-3xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="tnt-panel p-5 group">
              <summary className="font-semibold cursor-pointer list-none flex justify-between items-center gap-3">
                <span>{q}</span>
                <span
                  aria-hidden
                  className="text-[var(--tnt-red)] text-xl group-open:rotate-45 transition-transform"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
