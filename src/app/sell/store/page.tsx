import { StoreForm } from "@/components/StoreForm";
import { SellerNav } from "@/components/SellerNav";
import { getSellerStore } from "@/lib/seller";

export default async function StoreSettingsPage() {
  // The current seller's store (their own when signed in; the shared store in
  // no-auth mode; the dev store with no database). Redirects to /login when
  // auth is configured and nobody is signed in.
  const store = await getSellerStore();

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
