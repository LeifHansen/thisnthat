import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ScrollToTop } from "@/components/ScrollToTop";

export const metadata: Metadata = {
  title: "Listing published",
  robots: { index: false, follow: false },
};

export default async function SellSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; draft?: string; payouts?: string }>;
}) {
  const { id, draft, payouts } = await searchParams;
  const isDraft = draft === "1";
  // The seller pressed Post, but publishing is gated on payouts being enabled
  // (src/lib/sellerEligibility.ts): the listing was saved as a draft instead.
  const heldForPayouts = isDraft && payouts === "1";

  // Nudge sellers who haven't finished payout setup: the sale can complete
  // but the transfer can't land until Stripe payouts are enabled.
  const session = await auth();
  const me = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { stripePayoutsEnabledAt: true },
      })
    : null;
  const needsPayouts = !!session?.user && !me?.stripePayoutsEnabledAt;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <ScrollToTop />
      <div className="tnt-panel p-8 sm:p-10 text-center space-y-5">
        <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--tnt-green-soft)]">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-[var(--tnt-green)]" aria-hidden>
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
            {heldForPayouts
              ? "Saved as a draft — one step before it goes live"
              : isDraft
                ? "Draft saved"
                : "Your listing is live! 🎉"}
          </h1>
          <p className="text-muted">
            {heldForPayouts
              ? "Listings publish once your seller payouts are set up, so a buyer's money always has somewhere to go. Connect payouts below (about two minutes), then publish from Edit listing."
              : isDraft
                ? "It's tucked away in your dashboard — post it whenever you're ready."
                : "Buyers can find it on the marketplace right now."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
          {id ? (
            <Link href={`/listings/${id}`} className="tnt-btn">
              View listing
            </Link>
          ) : (
            <Link href="/browse" className="tnt-btn">
              Browse listings
            </Link>
          )}
          <Link href="/sell" className="tnt-btn tnt-btn--ghost">
            List another
          </Link>
        </div>

        <p className="pt-1">
          <Link href="/dashboard" className="text-sm text-muted hover:!text-ink">
            Go to my dashboard
          </Link>
        </p>
      </div>

      {needsPayouts && (
        <div
          className="tnt-panel p-5 flex items-center justify-between gap-4 flex-wrap"
          style={{
            background: "var(--tnt-purple-soft)",
            borderColor: "var(--tnt-purple)",
          }}
        >
          <div className="space-y-0.5">
            <p className="font-bold text-[var(--tnt-purple-text)]">
              💸 One more thing: set up payouts
            </p>
            <p className="text-sm text-ink">
              When this sells, you&apos;re paid through Stripe once the buyer
              confirms delivery — connect your payout account so the money has
              somewhere to go.
            </p>
          </div>
          <Link href="/dashboard#payouts" className="tnt-btn shrink-0">
            Connect payouts →
          </Link>
        </div>
      )}
    </div>
  );
}
