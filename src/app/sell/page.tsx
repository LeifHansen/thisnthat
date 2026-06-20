import Link from "next/link";

export default function SellPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Open your store</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Listing on ThisNThat is built to be effortless: snap a few photos, set a price,
        decide whether to accept offers, and you&apos;re live. Every seller gets a fully
        customizable storefront.
      </p>

      <ol className="mt-8 space-y-4">
        {[
          ["Create your store", "Pick a name, colors, and a banner — your storefront, your brand."],
          ["Upload an item", "Photos, price, condition, size. Toggle “accept offers” if you want."],
          ["Get paid", "Buyers check out securely; payouts go straight to your account via Stripe."],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-bold text-white">
              {i + 1}
            </span>
            <div>
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-zinc-500">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/sell/new"
          className="rounded-xl bg-indigo-600 p-6 text-white transition-colors hover:bg-indigo-500"
        >
          <h3 className="text-lg font-semibold">List an item →</h3>
          <p className="mt-1 text-sm text-indigo-100">
            Upload photos, set a price, choose whether to accept offers.
          </p>
        </Link>
        <Link
          href="/sell/store"
          className="rounded-xl border border-zinc-300 p-6 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          <h3 className="text-lg font-semibold">Customize your store →</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Set your name, tagline, and brand colors.
          </p>
        </Link>
      </div>

      <p className="mt-4 text-center text-sm text-zinc-500">
        <Link href="/store/my-store" className="font-medium text-indigo-600 hover:underline">
          View your storefront →
        </Link>
      </p>
    </main>
  );
}
