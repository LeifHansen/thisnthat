import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getListingById } from "@/lib/data";
import { CheckoutForm } from "@/components/CheckoutForm";
import { formatPrice } from "@/lib/types";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href={`/listings/${listing.id}`}
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        ← Back to item
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Checkout</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="order-2 lg:order-1">
          <CheckoutForm listing={listing} />
        </div>

        {/* Order summary */}
        <aside className="order-1 h-fit rounded-xl border border-zinc-200 p-5 dark:border-zinc-800 lg:order-2">
          <div className="flex gap-3">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <Image src={listing.images[0]} alt={listing.title} fill sizes="64px" className="object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{listing.title}</p>
              <p className="text-sm text-zinc-500">{listing.store.name}</p>
            </div>
          </div>
          <dl className="mt-4 space-y-1 text-sm">
            <Row label="Item" value={formatPrice(listing.price_cents, listing.currency)} />
            <Row label="Shipping" value="Calculated next" />
            <div className="mt-2 flex justify-between border-t border-zinc-200 pt-2 font-semibold dark:border-zinc-800">
              <span>Total</span>
              <span>{formatPrice(listing.price_cents, listing.currency)}</span>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
