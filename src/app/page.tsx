import { getCategories, getListings } from "@/lib/data";
import { CategoryNav } from "@/components/CategoryNav";
import { ListingCard } from "@/components/ListingCard";
import { Hero } from "@/components/Hero";
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
      {!active && <Hero />}

      <div id="browse" className="mb-6">
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
