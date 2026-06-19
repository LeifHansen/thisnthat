import { notFound } from "next/navigation";
import { getStoreBySlug, getListings } from "@/lib/data";
import { ListingCard } from "@/components/ListingCard";

export default async function StorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const listings = await getListings({ storeSlug: slug });

  // Per-store customization: the banner uses the store's own theme colors.
  const banner = store.theme.banner_url;

  return (
    <main>
      <section
        className="relative px-4 py-12 text-white"
        style={
          banner
            ? undefined
            : {
                backgroundImage: `linear-gradient(135deg, ${store.theme.primary}, ${store.theme.accent})`,
              }
        }
      >
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="relative mx-auto max-w-6xl">
          <div className="flex items-center gap-4">
            <div
              className="grid h-16 w-16 place-items-center rounded-2xl bg-white/20 text-2xl font-bold backdrop-blur"
              aria-hidden
            >
              {store.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{store.name}</h1>
              {store.tagline && <p className="mt-1 text-white/80">{store.tagline}</p>}
            </div>
          </div>
          {store.description && (
            <p className="mt-4 max-w-2xl text-sm text-white/90">{store.description}</p>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <h2 className="mb-4 text-lg font-semibold">
          {listings.length} item{listings.length === 1 ? "" : "s"}
        </h2>
        {listings.length === 0 ? (
          <p className="py-16 text-center text-zinc-500">This store has no active listings.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
