import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import type { Prisma, ListingStatus } from "@prisma/client";
import { requireAdmin, isSuperadmin } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/fees";
import { displayNameOf } from "@/lib/users";
import { ConditionBadge } from "@/components/ConditionBadge";
import { AdminHeader } from "../AdminHeader";
import { LISTING_STATUSES, loadQueueCount } from "../data";
import { ListingRowActions } from "./ListingRowActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Listings · Admin",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 100;

function isListingStatus(s: string | undefined): s is ListingStatus {
  return LISTING_STATUSES.includes(s as ListingStatus);
}

const STATUS_TONE: Record<ListingStatus, string> = {
  ACTIVE: "text-[var(--tnt-green)]",
  SOLD: "text-[var(--tnt-red)]",
  DRAFT: "text-muted",
  REMOVED: "text-muted",
};

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; q?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const status: ListingStatus | "all" =
    sp.status === "all" || isListingStatus(sp.status) ? sp.status : "ACTIVE";
  const category = (sp.category ?? "").trim().slice(0, 100);
  const q = (sp.q ?? "").trim().slice(0, 100);

  const where: Prisma.ListingWhereInput = {
    ...(status === "all" ? {} : { status }),
    ...(category ? { category: { slug: category } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { brand: { contains: q, mode: "insensitive" } },
            { itemName: { contains: q, mode: "insensitive" } },
            { seller: { name: { contains: q, mode: "insensitive" } } },
            { seller: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  let listings: Awaited<ReturnType<typeof query>> = [];
  let total = 0;
  let counts: Partial<Record<ListingStatus, number>> = {};
  let categories: { slug: string; name: string }[] = [];
  let loadError = false;
  try {
    const [rows, n, grouped, cats] = await Promise.all([
      query(where),
      prisma.listing.count({ where }),
      // Status counts respect the category filter but not the status one, so
      // the chips always show where the rest of the pile is.
      prisma.listing.groupBy({
        by: ["status"],
        where: category ? { category: { slug: category } } : {},
        _count: { _all: true },
      }),
      prisma.category.findMany({
        orderBy: [{ position: "asc" }, { name: "asc" }],
        select: { slug: true, name: true },
      }),
    ]);
    listings = rows;
    total = n;
    counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    categories = cats;
  } catch (e) {
    console.error("admin: failed to load listings", e);
    loadError = true;
  }
  const ordersCount = await loadQueueCount();
  const superadmin = isSuperadmin(admin);

  const filterHref = (s: string) => {
    const params = new URLSearchParams({ status: s });
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    return `/admin/listings?${params.toString()}`;
  };
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-bold border ${
      active
        ? "bg-[var(--tnt-dark)] !text-white border-[var(--tnt-dark)]"
        : "!text-ink border-[var(--tnt-line)] hover:bg-black/5"
    }`;

  return (
    <div className="space-y-6">
      <AdminHeader isSuperadmin={superadmin} ordersCount={ordersCount} />

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h1 className="text-ink text-2xl">Listings</h1>
        <span className="text-muted text-sm">
          {total.toLocaleString()} match{total === 1 ? "" : "es"}
          {total > PAGE_SIZE ? ` · showing newest ${PAGE_SIZE}` : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {LISTING_STATUSES.map((s) => (
          <Link key={s} href={filterHref(s)} className={chip(status === s)}>
            {s}
            {counts[s] != null ? ` (${counts[s]})` : ""}
          </Link>
        ))}
        <Link href={filterHref("all")} className={chip(status === "all")}>
          ALL
        </Link>
        <form
          className="ml-auto flex flex-wrap gap-2"
          action="/admin/listings"
          method="get"
        >
          {status !== "ACTIVE" && <input type="hidden" name="status" value={status} />}
          <select
            className="tnt-input !py-1.5 max-w-[200px]"
            name="category"
            defaultValue={category}
            aria-label="Category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="tnt-input !py-1.5 max-w-[220px]"
            name="q"
            defaultValue={q}
            placeholder="Search title / brand / seller"
          />
          <button className="tnt-btn !py-1.5 !px-3 !text-sm" type="submit">
            Search
          </button>
        </form>
      </div>

      {loadError ? (
        <div className="tnt-panel p-8 text-center text-[var(--tnt-red)]">
          Couldn&apos;t load listings.
        </div>
      ) : listings.length === 0 ? (
        <div className="tnt-panel p-8 text-center text-muted">
          No listings match.
        </div>
      ) : (
        <div className="tnt-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-[var(--tnt-line)]">
                <th className="p-3">Listing</th>
                <th className="p-3">Category</th>
                <th className="p-3">Condition</th>
                <th className="p-3">Price</th>
                <th className="p-3">Seller</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => {
                const detail = [l.brand, l.itemName].filter(Boolean).join(" · ");
                return (
                  <tr
                    key={l.id}
                    className="border-b border-[var(--tnt-line)] last:border-0 align-middle"
                  >
                    <td className="p-3">
                      <Link
                        href={`/listings/${l.id}`}
                        className="flex items-center gap-3 !text-ink hover:!text-[var(--tnt-red)] min-w-0"
                      >
                        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[var(--tnt-line)] bg-[var(--tnt-surface)]">
                          {l.photos[0] ? (
                            <Image
                              src={l.photos[0]}
                              alt={l.title}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[8px] text-muted">
                              —
                            </span>
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 max-w-[260px]">
                            {l.isLot && (
                              <span className="shrink-0 rounded-full bg-[var(--tnt-purple)] text-white text-[9px] font-bold px-1.5 py-0.5">
                                LOT
                              </span>
                            )}
                            <span className="font-semibold truncate">{l.title}</span>
                          </span>
                          <span className="block text-muted text-xs truncate max-w-[260px]">
                            {l.isLot
                              ? `${l._count.lotItems} item type${l._count.lotItems === 1 ? "" : "s"}`
                              : detail || "—"}
                            {l.quantity !== 1 ? ` · qty ${l.quantity}` : ""}
                            {l._count.offers
                              ? ` · ${l._count.offers} offer${l._count.offers === 1 ? "" : "s"}`
                              : ""}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted">
                      {l.category.name}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <ConditionBadge condition={l.condition} />
                    </td>
                    <td className="p-3 whitespace-nowrap font-semibold">
                      {formatCents(l.priceCents)}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {superadmin ? (
                        <Link
                          href={`/admin/users/${l.sellerId}`}
                          className="!text-ink hover:!text-[var(--tnt-red)] font-medium"
                        >
                          {displayNameOf(l.seller)}
                        </Link>
                      ) : (
                        <span className="text-ink font-medium">
                          {displayNameOf(l.seller)}
                        </span>
                      )}
                      {l.seller.suspended && (
                        <span className="ml-1.5 rounded-full bg-red-100 text-[var(--tnt-red)] text-[10px] font-bold px-1.5 py-0.5">
                          SUSPENDED
                        </span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`text-xs font-bold ${STATUS_TONE[l.status]}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted">
                      {l.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="p-3">
                      <ListingRowActions id={l.id} title={l.title} status={l.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-muted text-xs">
        Removing hides a listing from Browse and the seller&apos;s store but
        keeps its orders and offers. Restore is only offered for removed
        listings whose seller is in good standing.
      </p>
    </div>
  );
}

function query(where: Prisma.ListingWhereInput) {
  return prisma.listing.findMany({
    where,
    select: {
      id: true,
      title: true,
      brand: true,
      itemName: true,
      condition: true,
      priceCents: true,
      quantity: true,
      isLot: true,
      photos: true,
      status: true,
      createdAt: true,
      sellerId: true,
      category: { select: { name: true } },
      seller: {
        select: { name: true, displayName: true, email: true, suspended: true },
      },
      _count: { select: { offers: true, lotItems: true } },
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });
}
