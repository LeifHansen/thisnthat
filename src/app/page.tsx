import { getCategories, getListings } from "@/lib/data";
import { CategoryNav } from "@/components/CategoryNav";
import { ListingCard } from "@/components/ListingCard";
import type { CategorySlug } from "@/lib/types";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const active = category as CategorySlug | undefined;

  const [categories, listings] = await Promise.all([
    getCategories(),
    getListings(active ? { category: active } : undefined),
  ]);

  const activeName = categories.find((c) => c.slug === active)?.name;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {!active && (
        <section className="mb-8 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-8 text-white sm:p-12">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Vintage finds, sneakers & collectables — from sellers&apos; own stores.
          </h1>
          <p className="mt-3 max-w-xl text-indigo-100">
            Buy it now, or make an offer. Every seller runs their own customizable storefront.
          </p>
        </section>
      )}

      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">
          {activeName ?? "Browse everything"}
        </h2>
        <CategoryNav categories={categories} active={active} />
      </div>

      {listings.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No listings here yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </main>
  );
}
