import { getCategories } from "@/lib/data";
import { ListingForm } from "@/components/ListingForm";
import { SellerNav } from "@/components/SellerNav";
import { requireSeller } from "@/lib/seller";

export default async function NewListingPage() {
  await requireSeller();
  const categories = await getCategories();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <SellerNav />
      <h1 className="text-2xl font-bold tracking-tight">List an item</h1>
      <p className="mt-1 text-sm text-zinc-500">
        A few photos, a price, and you&apos;re live. Toggle offers if you&apos;re open to them.
      </p>

      <div className="mt-6">
        <ListingForm categories={categories} />
      </div>
    </main>
  );
}
