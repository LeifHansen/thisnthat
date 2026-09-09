import type { Metadata } from "next";
import Link from "next/link";
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

function loadUsers(page: number) {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      suspended: true,
      stripeConnectId: true,
      createdAt: true,
      _count: {
        select: { listings: true, sellerOrders: true, buyerOrders: true },
      },
    },
  });
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; page?: string }>;
}) {
  const admin = await requireSuperadmin();
  const { ok, error, page: pageRaw } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);

  let users: Awaited<ReturnType<typeof loadUsers>> = [];
  let totalUsers = 0;
  let usersError = false;
  try {
    [users, totalUsers] = await Promise.all([
      loadUsers(page),
      prisma.user.count(),
    ]);
  } catch (e) {
    console.error("admin: failed to load users", e);
    usersError = true;
  }
  const queueCount = await loadQueueCount();
  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <AdminHeader isSuperadmin queueCount={queueCount} />

      <div className="flex items-end justify-between gap-3">
        <h1 className="text-ink text-2xl">Users</h1>
        <span className="text-muted text-sm">
          {totalUsers.toLocaleString()} accounts
          {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
        </span>
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2 text-sm">
          {page > 1 && (
            <Link href={`/admin/users?page=${page - 1}`} className="bx-btn bx-btn--ghost !py-1.5 !px-4">
              ← Newer
            </Link>
          )}
          {page < totalPages && (
            <Link href={`/admin/users?page=${page + 1}`} className="bx-btn bx-btn--ghost !py-1.5 !px-4">
              Older →
            </Link>
          )}
        </div>
      )}

      {ok && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 px-4 py-2 text-sm">
          {ok}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-[var(--bx-red)] px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {usersError ? (
        <div className="bx-panel p-8 text-center text-[var(--bx-red)]">
          Couldn&apos;t load users. The database schema may be out of date in
          this environment.
        </div>
      ) : (
        <div className="bx-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-[var(--bx-line)]">
                <th className="p-3">Account</th>
                <th className="p-3">Role</th>
                <th className="p-3 whitespace-nowrap">Listings / Orders</th>
                <th className="p-3">Joined</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.email.toLowerCase() === admin.email?.toLowerCase();
                const orders = u._count.sellerOrders + u._count.buyerOrders;
                const deletable =
                  !isSelf &&
                  u._count.listings === 0 &&
                  orders === 0;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-[var(--bx-line)] last:border-0 align-middle"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="font-semibold !text-ink hover:!text-[var(--bx-red)]"
                        >
                          {u.name}
                        </Link>
                        {u.suspended && (
                          <span className="rounded-full bg-red-100 text-[var(--bx-red)] text-[10px] font-bold px-1.5 py-0.5">
                            SUSPENDED
                          </span>
                        )}
                        {u.stripeConnectId && (
                          <span
                            className="rounded-full bg-[var(--bx-blue-bright)]/20 text-[var(--bx-blue-bright)] text-[10px] font-bold px-1.5 py-0.5"
                            title="Stripe Connect linked"
                          >
                            STRIPE
                          </span>
                        )}
                      </div>
                      <p className="text-muted text-xs">{u.email}</p>
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-xs font-bold ${
                          u.role === "ADMIN"
                            ? "text-[var(--bx-red)]"
                            : "text-muted"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted">
                      {u._count.listings} / {orders}
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
        Deleting is blocked for accounts with any listings or orders to protect
        marketplace records — suspend those instead. Suspending blocks sign-in
        and pulls the seller&apos;s active listings.
      </p>
    </div>
  );
}
