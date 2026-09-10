import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { CATEGORIES, facetFields, type AttributeField } from "@/lib/categories";
import { CONDITIONS, conditionLabel } from "@/lib/listingOptions";
import {
  getListingsPage,
  getLots,
  countActiveLots,
  countByCategory,
  sweepAbandonedReservations,
  type LotCardData,
} from "@/lib/listings";
import { sweepFirstListingNudges } from "@/lib/nudges";
import { SITE_NAME } from "@/lib/site";
import { ListingCard, type ListingCardData } from "@/components/ListingCard";
import { LotCard } from "@/components/LotCard";
import {
  ATTR_PREFIX,
  SORTS,
  browseHref,
  buildBrowseWhere,
  filterParams,
  parseBrowseParams,
  type BrowseFilters,
  type RawSearchParams,
} from "./filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseBrowseParams(await searchParams);
  if (f.q) {
    // Search result pages are for people, not crawlers — canonical so links
    // to them resolve, but never indexed.
    return {
      title: `Results for “${f.q}”`,
      description: `Search results for “${f.q}” on ${SITE_NAME}.`,
      alternates: { canonical: `/browse?q=${encodeURIComponent(f.q)}` },
      robots: { index: false, follow: true },
    };
  }
  if (f.lots) {
    return {
      title: "Lots & Bundles for Sale",
      description: `Shop lots on ${SITE_NAME} — several items sold together for one price, shipped as one parcel. Your payment is held until you confirm delivery.`,
      alternates: { canonical: "/browse?type=lots" },
      openGraph: {
        title: `Lots & Bundles for Sale on ${SITE_NAME}`,
        description: "Several items, one price, one parcel.",
        url: "/browse?type=lots",
      },
    };
  }
  if (f.category) {
    const c = f.category;
    return {
      title: `${c.name} for Sale`,
      description: `${c.blurb} Shop ${c.name.toLowerCase()} from independent sellers on ${SITE_NAME} — your payment is held until you confirm delivery.`,
      alternates: { canonical: `/browse?category=${c.slug}` },
      openGraph: {
        title: `${c.name} for Sale on ${SITE_NAME}`,
        description: c.blurb,
        url: `/browse?category=${c.slug}`,
      },
    };
  }
  return {
    title: "Browse",
    description: `Browse everything for sale on ${SITE_NAME}: clothing, shoes, collectibles, electronics, home goods and more from independent sellers. Filter by category, condition and price.`,
    alternates: { canonical: "/browse" },
    openGraph: {
      title: `Browse ${SITE_NAME}`,
      description: "Everything for sale from independent sellers, in one place.",
      url: "/browse",
    },
  };
}

function sortLots(lots: LotCardData[], sort: BrowseFilters["sort"]): LotCardData[] {
  if (sort === "price_asc") return [...lots].sort((a, b) => a.priceCents - b.priceCents);
  if (sort === "price_desc") return [...lots].sort((a, b) => b.priceCents - a.priceCents);
  return lots; // getLots already returns newest first
}

export default async function BrowsePage({ searchParams }: Props) {
  // Opportunistically free any listings stranded SOLD by an abandoned checkout
  // so they reappear in the marketplace. Throttled + fire-and-forget.
  sweepAbandonedReservations();
  // Same pattern: mail the one-time "list your first item" nudge to accounts
  // that never listed. Throttled to once an hour per instance.
  sweepFirstListingNudges();

  const f = parseBrowseParams(await searchParams);
  const where = await buildBrowseWhere(f);
  // The category chips count what each category WOULD show under the other
  // active filters, so the where they use drops only the category clause.
  const whereAnyCategory = { ...where };
  delete whereAnyCategory.category;

  const skip = (f.page - 1) * PAGE_SIZE;

  // Category rows map the slug in the URL to the id Prisma groups by. Seeded
  // from src/lib/categories.ts; an unseeded table just yields zero counts.
  const [categoryRows, lotCount, view] = await Promise.all([
    prisma.category
      .findMany({ select: { id: true, slug: true } })
      .catch(() => [] as { id: string; slug: string }[]),
    countActiveLots(),
    f.lots
      ? // getLots isn't paged (lots are few): read every lot matching the
        // non-category filters once, derive the chip counts from it, then
        // narrow / sort / slice in memory.
        getLots(whereAnyCategory).then((all) => ({ all }))
      : Promise.all([
          getListingsPage({ where, skip, take: PAGE_SIZE, sort: f.sort }),
          countByCategory(whereAnyCategory),
        ]).then(([page, counts]) => ({ page, counts })),
  ]);
  const idBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));

  let items: ListingCardData[] = [];
  let lots: LotCardData[] = [];
  let total = 0;
  let countsById: Map<string, number>;
  if ("all" in view) {
    countsById = new Map();
    for (const l of view.all) {
      countsById.set(l.categoryId, (countsById.get(l.categoryId) ?? 0) + 1);
    }
    const categoryId = f.category ? idBySlug.get(f.category.slug) : undefined;
    const matching = f.category
      ? view.all.filter((l) => l.categoryId === categoryId)
      : view.all;
    total = matching.length;
    lots = sortLots(matching, f.sort).slice(skip, skip + PAGE_SIZE);
  } else {
    items = view.page.items;
    total = view.page.total;
    countsById = view.counts;
  }
  const countFor = (slug: string) => countsById.get(idBySlug.get(slug) ?? "") ?? 0;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (mutate?: (p: URLSearchParams) => void) => browseHref(f, mutate);
  const pageHref = (n: number) =>
    href((p) => {
      if (n > 1) p.set("page", String(n));
    });

  const itemsHref = href((p) => p.delete("type"));
  const lotsHref = href((p) => p.set("type", "lots"));
  const dropFacets = (p: URLSearchParams) => {
    for (const key of [...p.keys()]) if (key.startsWith(ATTR_PREFIX)) p.delete(key);
  };

  const title = f.q
    ? `Results for “${f.q}”`
    : f.lots
      ? "Lots & bundles"
      : f.category
        ? f.category.name
        : "Browse";
  const blurb = f.lots
    ? "Several items sold together for one price and shipped as one parcel."
    : f.category?.blurb;

  const facets = f.category ? facetFields(f.category) : [];
  const hasRefinements =
    f.min !== null || f.max !== null || f.sort !== "newest" || Object.keys(f.attrs).length > 0;

  // Active-filter pills: label + the href that removes just that filter.
  const pills: { key: string; label: string; href: string }[] = [];
  if (f.q) pills.push({ key: "q", label: `“${f.q}”`, href: href((p) => p.delete("q")) });
  if (f.category) {
    pills.push({
      key: "category",
      label: f.category.name,
      href: href((p) => {
        p.delete("category");
        dropFacets(p);
      }),
    });
  }
  if (f.condition) {
    pills.push({
      key: "condition",
      label: conditionLabel(f.condition),
      href: href((p) => p.delete("condition")),
    });
  }
  if (f.min !== null) pills.push({ key: "min", label: `Min $${f.min}`, href: href((p) => p.delete("min")) });
  if (f.max !== null) pills.push({ key: "max", label: `Max $${f.max}`, href: href((p) => p.delete("max")) });
  for (const field of facets) {
    const v = f.attrs[field.key];
    if (!v) continue;
    pills.push({
      key: `attr.${field.key}`,
      label: `${field.label}: ${v}`,
      href: href((p) => p.delete(`${ATTR_PREFIX}${field.key}`)),
    });
  }

  // Hidden inputs that carry every filter EXCEPT the ones a form edits, so
  // submitting one form never wipes the others.
  const hidden = (omit: Set<string>) =>
    [...filterParams(f).entries()]
      .filter(([k]) => !omit.has(k) && !(omit.has(ATTR_PREFIX) && k.startsWith(ATTR_PREFIX)))
      .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  const noun = f.lots ? "lot" : "item";
  const grid = f.lots ? lots.length : items.length;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl">{title}</h1>
        {blurb && <p className="text-muted text-sm max-w-2xl">{blurb}</p>}
      </div>

      {/* Search */}
      <form action="/browse" method="get" role="search" className="flex gap-2 max-w-xl">
        {hidden(new Set(["q"]))}
        <input
          type="search"
          name="q"
          defaultValue={f.q}
          placeholder="Search titles, brands and descriptions"
          aria-label="Search listings"
          className="tnt-input"
        />
        <button type="submit" className="tnt-btn !py-2 !px-4 text-sm shrink-0">
          Search
        </button>
      </form>

      {/* View switch: single items vs. lots */}
      <div className="flex gap-2 flex-wrap items-center">
        <Link
          href={itemsHref}
          className={`tnt-badge ${!f.lots ? "tnt-badge--on" : ""}`}
          aria-current={!f.lots ? "page" : undefined}
        >
          Items
        </Link>
        <Link
          href={lotsHref}
          className={`tnt-badge ${f.lots ? "tnt-badge--on" : ""}`}
          aria-current={f.lots ? "page" : undefined}
        >
          Lots{lotCount ? ` (${lotCount})` : ""}
        </Link>
      </div>

      {/* Category chips with live counts (under the other active filters).
          Switching category drops that category's facets. */}
      <div className="flex gap-2 flex-wrap items-center" aria-label="Category">
        <Link
          href={href((p) => {
            p.delete("category");
            dropFacets(p);
          })}
          className={`tnt-badge ${!f.category ? "tnt-badge--on" : ""}`}
          aria-current={!f.category ? "page" : undefined}
        >
          All categories
        </Link>
        {CATEGORIES.map((c) => {
          const on = f.category?.slug === c.slug;
          const n = countFor(c.slug);
          return (
            <Link
              key={c.slug}
              href={href((p) => {
                p.set("category", c.slug);
                dropFacets(p);
              })}
              className={`tnt-badge ${on ? "tnt-badge--on" : ""} ${!on && n === 0 ? "opacity-60" : ""}`}
              aria-current={on ? "page" : undefined}
            >
              {c.name}
              {n > 0 && <span className="font-normal opacity-80">({n})</span>}
            </Link>
          );
        })}
      </div>

      {/* Condition chips */}
      <div className="flex gap-2 flex-wrap items-center" aria-label="Condition">
        <Link
          href={href((p) => p.delete("condition"))}
          className={`tnt-badge ${!f.condition ? "tnt-badge--on" : ""}`}
          aria-current={!f.condition ? "page" : undefined}
        >
          Any condition
        </Link>
        {CONDITIONS.map((c) => {
          const on = f.condition === c.value;
          return (
            <Link
              key={c.value}
              href={href((p) => p.set("condition", c.value))}
              className={`tnt-badge ${on ? "tnt-badge--on" : ""}`}
              aria-current={on ? "page" : undefined}
              title={c.hint}
            >
              {c.label}
            </Link>
          );
        })}
      </div>

      {/* Price / sort / per-category facets */}
      <form
        action="/browse"
        method="get"
        className="tnt-panel p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end"
      >
        {hidden(new Set(["min", "max", "sort", ATTR_PREFIX]))}
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Min $</span>
            <input
              name="min"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              defaultValue={f.min ?? ""}
              placeholder="0"
              className="tnt-input"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Max $</span>
            <input
              name="max"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              defaultValue={f.max ?? ""}
              placeholder="Any"
              className="tnt-input"
            />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Sort</span>
          <select name="sort" defaultValue={f.sort} className="tnt-input">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {facets.map((field) => (
          <FacetInput key={field.key} field={field} value={f.attrs[field.key] ?? ""} />
        ))}
        <div className="flex gap-2 items-center">
          <button type="submit" className="tnt-btn tnt-btn--ghost !py-2 !px-4 text-sm">
            Apply
          </button>
          {hasRefinements && (
            <Link
              href={href((p) => {
                p.delete("min");
                p.delete("max");
                p.delete("sort");
                dropFacets(p);
              })}
              className="text-sm font-semibold !text-[var(--tnt-red)]"
            >
              Reset
            </Link>
          )}
        </div>
      </form>

      {/* Active filters + result count */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="text-muted mr-1">
          <span className="font-semibold text-ink">{total}</span> {noun}
          {total === 1 ? "" : "s"}
          {pageCount > 1 ? ` · page ${Math.min(f.page, pageCount)} of ${pageCount}` : ""}
        </p>
        {pills.map((pill) => (
          <Link
            key={pill.key}
            href={pill.href}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--tnt-line-strong)] bg-[var(--tnt-surface)] px-2.5 py-1 text-xs font-semibold !text-ink hover:border-[var(--tnt-red)]"
            aria-label={`Remove filter ${pill.label}`}
          >
            {pill.label} <span aria-hidden="true">×</span>
          </Link>
        ))}
        {pills.length > 1 && (
          <Link
            href={f.lots ? "/browse?type=lots" : "/browse"}
            className="text-xs font-semibold !text-[var(--tnt-red)]"
          >
            Clear all
          </Link>
        )}
      </div>

      {grid === 0 ? (
        <div className="tnt-panel p-8 text-center text-muted space-y-2">
          <p>
            {pills.length > 0
              ? `No ${noun}s match these filters.`
              : f.lots
                ? "No lots listed right now — check back soon."
                : "Nothing listed right now — check back soon."}
          </p>
          {pills.length > 0 ? (
            <Link
              href={f.lots ? "/browse?type=lots" : "/browse"}
              className="!text-[var(--tnt-red)] font-semibold"
            >
              Clear filters →
            </Link>
          ) : (
            <Link href="/sell" className="!text-[var(--tnt-red)] font-semibold">
              Have something to sell? List it →
            </Link>
          )}
        </div>
      ) : f.lots ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {lots.map((lot) => (
            <LotCard key={lot.id} lot={lot} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          {f.page > 1 ? (
            <Link href={pageHref(f.page - 1)} className="tnt-btn tnt-btn--ghost !py-2 !px-4 text-sm">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted text-sm">
            Page {Math.min(f.page, pageCount)} of {pageCount}
          </span>
          {f.page < pageCount ? (
            <Link href={pageHref(f.page + 1)} className="tnt-btn tnt-btn--ghost !py-2 !px-4 text-sm">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function FacetInput({ field, value }: { field: AttributeField; value: string }) {
  const name = `${ATTR_PREFIX}${field.key}`;
  if (field.type === "select") {
    return (
      <label className="block space-y-1 text-sm">
        <span className="text-muted">{field.label}</span>
        <select name={name} defaultValue={value} className="tnt-input">
          <option value="">Any</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{field.label}</span>
      <input
        name={name}
        type={field.type === "number" ? "number" : "text"}
        min={field.type === "number" ? field.min : undefined}
        max={field.type === "number" ? field.max : undefined}
        defaultValue={value}
        placeholder={field.placeholder ?? "Any"}
        className="tnt-input"
      />
    </label>
  );
}
