import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import type { Prisma, ListingStatus } from "@prisma/client";
import { requireAdmin, isSuperadmin } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/fees";
import { AdminHeader } from "../AdminHeader";
import { loadQueueCount } from "../data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Listings · Admin",
  robots: { index: false, follow: false },
};

const STATUSES = ["ACTIVE", "SOLD", "PENDING_AUTH", "DRAFT", "REMOVED"] as const;
const PAGE_SIZE = 100;

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const status = (
    STATUSES.includes(sp.status as (typeof STATUSES)[number]) || sp.status === "all"
      ? sp.status
      : "ACTIVE"
  ) as ListingStatus | "all";
  const q = (sp.q ?? "").trim().slice(0, 100);

  const where: Prisma.ListingWhereInput = {
    ...(status === "all" ? {} : { status }),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { beanieName: { contains: q, mode: "insensitive" } },
            { seller: { name: { contains: q, mode: "insensitive" } } },
            { seller: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  let listings: Awaited<ReturnType<typeof query>> = [];
  let total = 0;
  let counts: Partial<Record<ListingStatus, number>> = {};
  let loadError = false;
  try {
    const [rows, n, grouped] = await Promise.all([
      query(where),
      prisma.listing.count({ where }),
      prisma.listing.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    listings = rows;
    total = n;
    counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  } catch (e) {
    console.error("admin: failed to load listings", e);
    loadError = true;
  }
  const queueCount = await loadQueueCount();
  const superadmin = isSuperadmin(admin);

  const filterHref = (s: string) =>
    `/admin/listings?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-6">
      <AdminHeader isSuperadmin={superadmin} queueCount={queueCount} />

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h1 className="text-ink text-2xl">Listings</h1>
        <span className="text-muted text-sm">
          {total.toLocaleString()} match{total === 1 ? "" : "es"}
          {total > PAGE_SIZE ? ` · showing first ${PAGE_SIZE}` : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={filterHref(s)}
            className={`rounded-full px-3 py-1 text-xs font-bold border ${
              status === s
                ? "bg-[var(--tnt-dark)] !text-white border-[var(--tnt-dark)]"
                : "!text-ink border-[var(--tnt-line)] hover:bg-black/5"
            }`}
          >
            {s.replace(/_/g, " ")}
            {counts[s] != null ? ` (${counts[s]})` : ""}
          </Link>
        ))}
        <Link
          href={filterHref("all")}
          className={`rounded-full px-3 py-1 text-xs font-bold border ${
            status === "all"
              ? "bg-[var(--tnt-dark)] !text-white border-[var(--tnt-dark)]"
              : "!text-ink border-[var(--tnt-line)] hover:bg-black/5"
          }`}
        >
          ALL
        </Link>
        <form className="ml-auto flex gap-2" action="/admin/listings" method="get">
          {status !== "ACTIVE" && <input type="hidden" name="status" value={status} />}
          <input
            className="tnt-input !py-1.5 max-w-[220px]"
            name="q"
            defaultValue={q}
            placeholder="Search title / beanie / seller"
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
                <th className="p-3">Seller</th>
                <th className="p-3">Price</th>
                <th className="p-3">Auth</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
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
                          <span className="font-semibold truncate">
                            {l.title}
                          </span>
                        </span>
                        <span className="block text-muted text-xs">
                          {l.isLot ? `${l._count.lotItems} types` : l.beanieName}
                          {!l.isLot && l.year ? ` · ${l.year}` : ""}
                          {l._count.offers ? ` · ${l._count.offers} offer${l._count.offers === 1 ? "" : "s"}` : ""}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {superadmin ? (
                      <Link
                        href={`/admin/users/${l.sellerId}`}
                        className="!text-ink hover:!text-[var(--tnt-red)] font-medium"
                      >
                        {l.seller.name}
                      </Link>
                    ) : (
                      <span className="text-ink font-medium">{l.seller.name}</span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap font-semibold">
                    {formatCents(l.priceCents)}
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted text-xs">
                    {l.authType.replace(/_/g, " ")}
                    {l.registrationNumber ? ` · #${l.registrationNumber}` : ""}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <span
                      className={`text-xs font-bold ${
                        l.status === "ACTIVE"
                          ? "text-[var(--tnt-green)]"
                          : l.status === "SOLD"
                            ? "text-[var(--tnt-red)]"
                            : "text-muted"
                      }`}
                    >
                      {l.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted">
                    {l.createdAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function query(where: Prisma.ListingWhereInput) {
  return prisma.listing.findMany({
    where,
    include: {
      seller: { select: { name: true, email: true } },
      _count: { select: { offers: true, lotItems: true } },
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });
}
