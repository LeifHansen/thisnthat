import type { Metadata } from "next";
import Link from "next/link";
import {
  getBeanieGroups,
  getLots,
  countActiveLots,
  sweepAbandonedReservations,
  type BeanieOption,
  type LotCardData,
} from "@/lib/listings";
import { sweepFirstListingNudges } from "@/lib/nudges";
import { BeanieOptionCard } from "@/components/BeanieOptionCard";
import { LotCard } from "@/components/LotCard";
import {
  SHOP_COLLECTIONS,
  getCollection,
  inCollection,
} from "@/lib/collections";
import type { AuthType, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  auth?: string;
  hide?: string;
  collection?: string;
  type?: string;
}>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { collection, type } = await searchParams;
  if (type === "lots") {
    return {
      title: "Beanie Baby Lots for Sale — Bulk Bundles | Beanie Xchange",
      description:
        "Shop lots of Beanie Babies for sale on Beanie Xchange — bulk bundles and multi-beanie collections sold together for one price. Every purchase is escrow-protected.",
      alternates: { canonical: "/browse?type=lots" },
      openGraph: {
        title: "Beanie Baby Lots for Sale on Beanie Xchange",
        description:
          "Bulk bundles and multi-beanie collections, escrow-protected.",
        url: "/browse?type=lots",
      },
    };
  }
  const col = getCollection(collection);
  if (col) {
    return {
      title: `${col.label} — Beanie Babies for Sale | Authenticated & Escrow-Protected`,
      description: `${col.blurb} Shop the ${col.label} collection on Beanie Xchange — every purchase escrow-protected.`,
      alternates: { canonical: `/browse?collection=${col.key}` },
      openGraph: {
        title: `Shop the ${col.label} Beanie Baby Collection`,
        description: col.blurb,
        url: `/browse?collection=${col.key}`,
      },
    };
  }
  return {
    title: "Browse Beanie Babies for Sale — Authenticated, Graded, Escrow",
    description:
      "Shop authenticated Beanie Babies for sale on Beanie Xchange. Filter by True Blue verified, third-party COA, or unauthenticated. Every purchase is escrow-protected. Original 9, Princess Diana, retired & rare.",
    alternates: { canonical: "/browse" },
    keywords: [
      "buy Beanie Babies",
      "Beanie Babies for sale",
      "authenticated Beanie Babies",
      "rare Beanie Babies for sale",
      "Princess Diana Beanie Baby",
      "Original 9 Beanie Babies",
      "True Blue verified Beanie Babies",
    ],
    openGraph: {
      title: "Browse Beanie Babies for Sale on Beanie Xchange",
      description:
        "Authenticated, graded, escrow-protected. Buy Beanie Babies with confidence.",
      url: "/browse",
    },
  };
}

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "TRUE_BLUE", label: "True Blue" },
  { key: "THIRD_PARTY_COA", label: "Third-Party COA" },
  { key: "UNAUTHENTICATED", label: "Unauthenticated" },
];

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Opportunistically free any listings stranded SOLD by an abandoned checkout
  // so they reappear in the marketplace. Throttled + fire-and-forget.
  sweepAbandonedReservations();
  // Same pattern: mail the one-time "list your first beanie" nudge to accounts
  // that never listed. Throttled to once an hour per instance.
  sweepFirstListingNudges();

  const sp = await searchParams;
  // "Lots" is a distinct storefront view: unique multi-beanie bundles instead
  // of the by-name grouped single-beanie options.
  const lotView = sp.type === "lots";
  // Whitelist ?auth= against the known filter keys — casting a raw
  // searchParam to AuthType lets any typo'd/stale URL 500 the page with a
  // PrismaClientValidationError.
  const active = FILTERS.some((f) => f.key === sp.auth) ? sp.auth! : "all";
  const hideUnauth = sp.hide === "unauth";
  // Collections classify by catalogue beanie name, which a mixed lot doesn't
  // have — so they only apply to the single-beanie view.
  const col = lotView ? undefined : getCollection(sp.collection);

  const where: Prisma.ListingWhereInput = {};
  if (active !== "all") {
    where.authType = active as AuthType;
  } else if (hideUnauth) {
    where.authType = { not: "UNAUTHENTICATED" };
  }

  let options: BeanieOption[] = [];
  let lots: LotCardData[] = [];
  if (lotView) {
    lots = await getLots(where);
  } else {
    // Group active listings by beanie so each card shows a price range across
    // however many sellers have posted that beanie (real-photo beanies first).
    options = await getBeanieGroups(where);
    if (col) {
      options = options.filter((o) => inCollection(o.beanieName, col.key));
    }
  }
  // Lot count powers the view-switch badge (and is free once we already loaded
  // lots in lot view).
  const lotCount = lotView ? lots.length : await countActiveLots();

  const withParams = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams();
    if (active !== "all") p.set("auth", active);
    if (hideUnauth) p.set("hide", "unauth");
    if (col) p.set("collection", col.key);
    if (lotView) p.set("type", "lots");
    mutate(p);
    const q = p.toString();
    return q ? `/browse?${q}` : "/browse";
  };

  const toggleHref = withParams((p) => {
    if (hideUnauth) p.delete("hide");
    else p.set("hide", "unauth");
  });
  const beaniesHref = withParams((p) => {
    p.delete("type");
  });
  const lotsHref = withParams((p) => {
    p.set("type", "lots");
    p.delete("collection");
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl">
          {lotView
            ? "Beanie Lots for Sale"
            : col
              ? `${col.label} — Beanie Babies for Sale`
              : "Browse Beanies"}
        </h1>
        {lotView ? (
          <p className="text-muted text-sm max-w-2xl">
            Multi-beanie bundles — a mix of different beanies, or multiples of
            the same — sold together as one lot for one price.
          </p>
        ) : col ? (
          <p className="text-muted text-sm max-w-2xl">{col.blurb}</p>
        ) : null}
      </div>

      {/* View switch: single beanies vs. lots */}
      <div className="flex gap-2 flex-wrap items-center">
        <Link
          href={beaniesHref}
          className={`tnt-badge ${!lotView ? "tnt-badge--on !text-white" : ""}`}
        >
          Single beanies
        </Link>
        <Link
          href={lotsHref}
          className={`tnt-badge ${lotView ? "tnt-badge--on !text-white" : ""}`}
        >
          🎁 Lots{lotCount ? ` (${lotCount})` : ""}
        </Link>
      </div>

      {/* Collection chips — single-beanie view only. Switching collections
          keeps the active auth/hide filters. */}
      {!lotView && (
        <div className="flex gap-2 flex-wrap items-center">
          {SHOP_COLLECTIONS.map((c) => {
            const on = c.key === "all" ? !col : col?.key === c.key;
            const href = withParams((p) => {
              p.delete("collection");
              if (c.key !== "all") p.set("collection", c.key);
            });
            return (
              <Link
                key={c.key}
                href={href}
                className={`tnt-badge ${on ? "tnt-badge--on !text-white" : ""}`}
              >
                {c.key === "all" ? "All Collections" : c.label}
              </Link>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {FILTERS.map((f) => {
          const href = withParams((p) => {
            p.delete("auth");
            if (f.key !== "all") p.set("auth", f.key);
            if (f.key === "UNAUTHENTICATED") p.delete("hide");
          });
          const on = active === f.key;
          return (
            <Link
              key={f.key}
              href={href}
              className={`tnt-badge ${on ? "tnt-badge--on !text-white" : ""}`}
            >
              {f.label}
            </Link>
          );
        })}
        <Link
          href={toggleHref}
          className={`tnt-badge ${hideUnauth ? "tnt-badge--on !text-white" : ""}`}
        >
          {hideUnauth ? "✓ Hiding unauthenticated" : "Hide unauthenticated"}
        </Link>
      </div>

      <p className="text-muted text-sm">
        {lotView
          ? "Lots are sold as one bundle for one price and ship together. Most are unauthenticated as-is — check each lot's photos and description."
          : "Authenticated listings carry a True Blue, third-party, or Beanie Xchange Certificate of Authenticity. Unauthenticated listings are sold as-is with no COA — clearly flagged, and filterable above."}
      </p>

      {lotView ? (
        lots.length === 0 ? (
          <div className="tnt-panel p-8 text-center text-muted space-y-2">
            <p>No lots listed right now — check back soon.</p>
            <Link
              href="/sell/lot"
              className="!text-[var(--tnt-red)] font-semibold"
            >
              Selling a bundle? List a Lot →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {lots.map((lot) => (
              <LotCard key={lot.id} lot={lot} />
            ))}
          </div>
        )
      ) : options.length === 0 ? (
        <div className="tnt-panel p-8 text-center text-muted space-y-2">
          <p>
            {col
              ? `No ${col.label} listings right now — check back soon, or browse the full marketplace.`
              : "Nothing here yet."}
          </p>
          {col && (
            <Link href="/browse" className="!text-[var(--tnt-red)] font-semibold">
              View all Beanies →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {options.map((o) => (
            <BeanieOptionCard key={o.beanieName} option={o} />
          ))}
        </div>
      )}
    </div>
  );
}
