import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireSuperadmin } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { AdminHeader } from "../AdminHeader";
import { loadQueueCount } from "../data";
import { UserRowActions } from "./UserRowActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Users · Admin",
  robots: { index: false, follow: false },
};

// Users grow without bound; the per-row _count triples the query cost, so the
// list is paged the same way /admin/listings is.
const PAGE_SIZE = 100;

function loadUsers(where: Prisma.UserWhereInput, page: number) {
  return prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      displayName: true,
      email: true,
      role: true,
      suspended: true,
      deletedAt: true,
      stripeConnectId: true,
      stripeConnectStartedAt: true,
      stripePayoutsEnabledAt: true,
      createdAt: true,
      _count: {
        select: {
          listings: true,
          sellerOrders: true,
          buyerOrders: true,
          offers: true,
          productReviews: true,
          sentMessages: true,
        },
      },
    },
  });
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; page?: string; q?: string }>;
}) {
  const admin = await requireSuperadmin();
  const { ok, error, page: pageRaw, q: qRaw } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const q = (qRaw ?? "").trim().slice(0, 100);

  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  let users: Awaited<ReturnType<typeof loadUsers>> = [];
  let totalUsers = 0;
  let usersError = false;
  try {
    [users, totalUsers] = await Promise.all([
      loadUsers(where, page),
      prisma.user.count({ where }),
    ]);
  } catch (e) {
    console.error("admin: failed to load users", e);
    usersError = true;
  }
  const ordersCount = await loadQueueCount();
  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
  const pageHref = (p: number) =>
    `/admin/users?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-6">
      <AdminHeader isSuperadmin ordersCount={ordersCount} />

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h1 className="text-ink text-2xl">Users</h1>
        <span className="text-muted text-sm">
          {totalUsers.toLocaleString()} account{totalUsers === 1 ? "" : "s"}
          {q ? ` matching “${q}”` : ""}
          {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {totalPages > 1 && (
          <div className="flex gap-2 text-sm">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="tnt-btn tnt-btn--ghost !py-1.5 !px-4">
                ← Newer
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="tnt-btn tnt-btn--ghost !py-1.5 !px-4">
                Older →
              </Link>
            )}
          </div>
        )}
        <form className="ml-auto flex gap-2" action="/admin/users" method="get">
          <input
            className="tnt-input !py-1.5 max-w-[240px]"
            name="q"
            defaultValue={q}
            placeholder="Search name / email"
          />
          <button className="tnt-btn !py-1.5 !px-3 !text-sm" type="submit">
            Search
          </button>
        </form>
      </div>

      {ok && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 px-4 py-2 text-sm">
          {ok}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-[var(--tnt-red)] px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {usersError ? (
        <div className="tnt-panel p-8 text-center text-[var(--tnt-red)]">
          Couldn&apos;t load users. The database schema may be out of date in
          this environment.
        </div>
      ) : users.length === 0 ? (
        <div className="tnt-panel p-8 text-center text-muted">No users match.</div>
      ) : (
        <div className="tnt-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-[var(--tnt-line)]">
                <th className="p-3">Account</th>
                <th className="p-3">Role</th>
                <th className="p-3 whitespace-nowrap">Listings / Orders</th>
                <th className="p-3">Payouts</th>
                <th className="p-3">Joined</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.email.toLowerCase() === admin.email?.toLowerCase();
                const orders = u._count.sellerOrders + u._count.buyerOrders;
                // Mirrors the refusal in deleteUser: anything that is another
                // user's record of this account keeps it around.
                const deletable =
                  !isSelf &&
                  u._count.listings === 0 &&
                  orders === 0 &&
                  u._count.offers === 0 &&
                  u._count.productReviews === 0 &&
                  u._count.sentMessages === 0;
                const payouts = u.stripePayoutsEnabledAt
                  ? "live"
                  : u.stripeConnectStartedAt || u.stripeConnectId
                    ? "started"
                    : null;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-[var(--tnt-line)] last:border-0 align-middle"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="font-semibold !text-ink hover:!text-[var(--tnt-red)]"
                        >
                          {u.name}
                        </Link>
                        {u.displayName && u.displayName !== u.name && (
                          <span className="text-muted text-xs">@{u.displayName}</span>
                        )}
                        {u.deletedAt ? (
                          <span className="rounded-full bg-black/10 text-muted text-[10px] font-bold px-1.5 py-0.5">
                            DELETED
                          </span>
                        ) : (
                          u.suspended && (
                            <span className="rounded-full bg-red-100 text-[var(--tnt-red)] text-[10px] font-bold px-1.5 py-0.5">
                              SUSPENDED
                            </span>
                          )
                        )}
                      </div>
                      <p className="text-muted text-xs">{u.email}</p>
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-xs font-bold ${
                          u.role === "ADMIN"
                            ? "text-[var(--tnt-red)]"
                            : "text-muted"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted">
                      {u._count.listings} / {orders}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {payouts === "live" ? (
                        <span
                          className="rounded-full bg-[var(--tnt-green-soft)] text-[var(--tnt-green)] text-[10px] font-bold px-1.5 py-0.5"
                          title="Stripe payouts enabled"
                        >
                          LIVE
                        </span>
                      ) : payouts === "started" ? (
                        <span
                          className="rounded-full bg-[#fbf1d6] text-[#a9790f] text-[10px] font-bold px-1.5 py-0.5"
                          title="Started Stripe onboarding but payouts aren't enabled yet"
                        >
                          STARTED
                        </span>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted">
                      {u.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="p-3">
                      <UserRowActions
                        id={u.id}
                        name={u.name}
                        role={u.role}
                        suspended={u.suspended}
                        isSelf={isSelf}
                        deletable={deletable}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-muted text-xs">
        Deleting is blocked for accounts with any orders, listings, offers,
        reviews or messages to protect marketplace records — suspend those
        instead. Suspending blocks sign-in and pulls the seller&apos;s active
        listings.
      </p>
    </div>
  );
}
