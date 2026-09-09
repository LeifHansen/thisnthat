import type { Metadata } from "next";
import Link from "next/link";
import { ScrollToTop } from "@/components/ScrollToTop";

export const metadata: Metadata = {
  title: "Listing Published",
  robots: { index: false, follow: false },
};

export default async function SellSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; first?: string }>;
}) {
  const { id, first } = await searchParams;
  const isFirst = first === "1";

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <ScrollToTop />
      <div className="bx-panel p-8 sm:p-10 text-center space-y-5">
        <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bx-green-soft)]">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-[var(--bx-green)]" aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold">
            {isFirst ? "Your first beanie is live! 🎉" : "Your beanie is listed!"}
          </h1>
          <p className="text-muted">
            {isFirst
              ? "Welcome to selling on Beanie Xchange — collectors can find it right now."
              : "It's now live on the marketplace for collectors to find."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
          {id ? (
            <Link href={`/listings/${id}`} className="bx-btn">
              View Listing
            </Link>
          ) : (
            <Link href="/browse" className="bx-btn">
              Browse Listings
            </Link>
          )}
          <Link href="/sell" className="bx-btn bx-btn--ghost">
            List another
          </Link>
        </div>

        <p className="pt-1">
          <Link href="/dashboard" className="text-sm text-muted hover:!text-ink">
            Go to my dashboard
          </Link>
        </p>
      </div>

      {isFirst && (
        <div
          className="bx-panel p-5 flex items-center justify-between gap-4 flex-wrap"
          style={{
            background: "var(--bx-purple-soft)",
            borderColor: "var(--bx-purple)",
          }}
        >
          <div className="space-y-0.5">
            <p className="font-bold text-[var(--bx-purple-text)]">
              💸 One more thing: set up payouts
            </p>
            <p className="text-sm text-ink">
              When this sells, payment is held in escrow — connect your payout
              account so it can be released to you.
            </p>
          </div>
          <Link href="/dashboard#payouts" className="bx-btn shrink-0">
            Connect payouts →
          </Link>
        </div>
      )}
    </div>
  );
}
