import Link from "next/link";
import { getStoreBySlug } from "@/lib/data";
import { getMyStore, MY_STORE_SLUG } from "@/lib/devstore";
import { StoreForm } from "@/components/StoreForm";
import { isDbConfigured } from "@/db";

export default async function StoreSettingsPage() {
  // In no-DB mode the editable store comes from the dev store; with Neon
  // configured it comes from the database (get-or-create on first save).
  const store = isDbConfigured
    ? (await getStoreBySlug(MY_STORE_SLUG)) ?? (await getMyStore())
    : await getMyStore();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/sell" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        ← Seller home
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Customize your store</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Make it yours — name, tagline, and brand colors that show on your storefront.
      </p>

      <div className="mt-6">
        <StoreForm store={store} />
      </div>
    </main>
  );
}
