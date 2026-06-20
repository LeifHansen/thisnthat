import Link from "next/link";
import { SellerNav } from "@/components/SellerNav";

export default function SellPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <SellerNav />

      {/* Tinker-style seller hero */}
      <section className="tk-clip tk-shadow relative overflow-hidden rounded-[24px] bg-[#5b2bff] px-6 py-12 text-white sm:px-10 sm:py-14">
        <div className="absolute inset-0 bg-gradient-to-br from-[#5b2bff] via-[#ff1e88] to-[#ff5a1f]" />
        <div className="tk-stripes absolute inset-0 opacity-50" />
        <div className="relative">
          <span className="inline-block -rotate-2 bg-[#d6ff3f] px-3 py-1 text-xs font-black uppercase tracking-widest text-black">
            Seller Hub
          </span>
          <h1 className="tk-display mt-4 text-5xl drop-shadow-[3px_3px_0_rgba(0,0,0,0.5)] sm:text-7xl">
            List it in
            <br />
            <span className="text-[#d6ff3f]">60 seconds.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base font-semibold text-white/90">
            Upload a photo — our AI scans it and fills in the title, category, condition, and a
            suggested price. You just hit publish.
          </p>
          <Link
            href="/sell/new"
            className="tk-shadow mt-7 inline-block -skew-x-6 bg-black px-7 py-3 text-base font-black uppercase italic tracking-tight text-white transition-transform hover:-translate-y-0.5"
          >
            Snap &amp; sell →
          </Link>
        </div>
      </section>

      <ol className="mt-10 grid gap-6 sm:grid-cols-3">
        {[
          ["Snap", "Upload a photo. AI reads the item and drafts your listing."],
          ["Tweak", "Glance over the details, set a price, toggle offers."],
          ["Sell", "Go live on your own storefront. Buyers buy now or make an offer."],
        ].map(([title, body], i) => (
          <li key={title} className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-sm font-black text-white">
              {i + 1}
            </span>
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-zinc-500">{body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/sell/new"
          className="rounded-xl bg-indigo-600 p-6 text-white transition-colors hover:bg-indigo-500"
        >
          <h3 className="text-lg font-semibold">List an item →</h3>
          <p className="mt-1 text-sm text-indigo-100">
            Photo-first, AI-assisted. Upload and we draft the rest.
          </p>
        </Link>
        <Link
          href="/sell/store"
          className="rounded-xl border border-zinc-300 p-6 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          <h3 className="text-lg font-semibold">Customize your store →</h3>
          <p className="mt-1 text-sm text-zinc-500">Set your name, tagline, and brand colors.</p>
        </Link>
      </div>
    </main>
  );
}
