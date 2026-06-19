import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getListingById } from "@/lib/data";
import { BuyPanel } from "@/components/BuyPanel";

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        ← Back to browse
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        {/* Gallery */}
        <div className="flex flex-col gap-3">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
            <Image
              src={listing.images[0]}
              alt={listing.title}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </div>
          {listing.images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {listing.images.slice(1).map((src, i) => (
                <div
                  key={i}
                  className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800"
                >
                  <Image src={src} alt="" fill sizes="25vw" className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <Link
            href={`/store/${listing.store.slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {listing.store.name}
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{listing.title}</h1>

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {listing.brand && <Detail label="Brand" value={listing.brand} />}
            {listing.size && <Detail label="Size" value={listing.size} />}
            {listing.condition && <Detail label="Condition" value={listing.condition} />}
          </dl>

          <p className="mt-4 whitespace-pre-line leading-relaxed text-zinc-700 dark:text-zinc-300">
            {listing.description}
          </p>

          <div className="mt-6">
            <BuyPanel listing={listing} />
          </div>
        </div>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className="font-medium text-zinc-800 dark:text-zinc-200">{value}</dd>
    </div>
  );
}
