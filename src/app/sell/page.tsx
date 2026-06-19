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

      <div className="mt-10 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        The seller dashboard and listing uploader are coming next.
        <div className="mt-3">
          <Link href="/login" className="font-medium text-indigo-600 hover:underline">
            Sign in to get started →
          </Link>
        </div>
      </div>
    </main>
  );
}
