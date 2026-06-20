import Link from "next/link";
import { getCategories } from "@/lib/data";
import { ListingForm } from "@/components/ListingForm";

export default async function NewListingPage() {
  const categories = await getCategories();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/sell" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        ← Seller home
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">List an item</h1>
      <p className="mt-1 text-sm text-zinc-500">
        A few photos, a price, and you&apos;re live. Toggle offers if you&apos;re open to them.
      </p>

      <div className="mt-6">
        <ListingForm categories={categories} />
      </div>
    </main>
  );
}
