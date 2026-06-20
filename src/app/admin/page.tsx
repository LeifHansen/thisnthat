import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllStores, getListings } from "@/lib/data";
import { isSuperAdmin, isAuthConfigured, SUPER_ADMIN_EMAIL } from "@/auth";
import { formatPrice } from "@/lib/types";

export const metadata = { title: "Admin · ThisNThat" };

export default async function AdminPage() {
  if (!(await isSuperAdmin())) notFound();

  const [stores, listings] = await Promise.all([getAllStores(), getListings()]);

  const countByStore = new Map<string, number>();
  const valueByStore = new Map<string, number>();
  for (const l of listings) {
    countByStore.set(l.store.slug, (countByStore.get(l.store.slug) ?? 0) + 1);
    valueByStore.set(l.store.slug, (valueByStore.get(l.store.slug) ?? 0) + l.price_cents);
  }
  const gmv = listings.reduce((sum, l) => sum + l.price_cents, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform admin</h1>
          <p className="text-sm text-zinc-500">Every tenant store and listing across ThisNThat.</p>
        </div>
        <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white">
          super admin
        </span>
      </div>

      {!isAuthConfigured && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Dev preview — auth isn&apos;t configured, so this admin view is open. Once Neon + Auth.js
          are connected it&apos;s restricted to <code>{SUPER_ADMIN_EMAIL}</code>.
        </p>
      )}

      {/* Top-line stats */}
      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Stores" value={String(stores.length)} />
        <Stat label="Active listings" value={String(listings.length)} />
        <Stat label="Catalog value" value={formatPrice(gmv)} />
        <Stat
          label="Avg / listing"
          value={listings.length ? formatPrice(Math.round(gmv / listings.length)) : "—"}
        />
      </section>

      {/* Stores table */}
      <section className="mt-8 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">Store</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 text-right font-medium">Listings</th>
              <th className="px-4 py-3 text-right font-medium">Catalog value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {stores.map((s) => (
              <tr key={s.slug}>
                <td className="px-4 py-3">
                  <Link href={`/store/${s.slug}`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-500">{s.slug}</td>
                <td className="px-4 py-3 text-right">{countByStore.get(s.slug) ?? 0}</td>
                <td className="px-4 py-3 text-right">{formatPrice(valueByStore.get(s.slug) ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
