import { getStoreBySlug } from "@/lib/data";
import { getMyStore, MY_STORE_SLUG } from "@/lib/devstore";
import { StoreForm } from "@/components/StoreForm";
import { SellerNav } from "@/components/SellerNav";
import { isDbConfigured } from "@/db";

export default async function StoreSettingsPage() {
  // In no-DB mode the editable store comes from the dev store; with Neon
  // configured it comes from the database (get-or-create on first save).
  const store = isDbConfigured
    ? (await getStoreBySlug(MY_STORE_SLUG)) ?? (await getMyStore())
    : await getMyStore();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <SellerNav />
      <h1 className="text-2xl font-bold tracking-tight">Customize your store</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Make it yours — name, tagline, and brand colors that show on your storefront.
      </p>

      <div className="mt-6">
        <StoreForm store={store} />
      </div>
    </main>
  );
}
