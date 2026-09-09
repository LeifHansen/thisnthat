import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { SellWizard } from "@/components/SellWizard";
import { createListing } from "./actions";

export const metadata: Metadata = {
  title: "Sell Beanie Babies Online — COA, Authentication & Escrow",
  description:
    "Sell Beanie Babies on Beanie Xchange. List your Ty Beanie Baby with a True Blue cert, BX Authentication, third-party COA, or as-is. Payments held in escrow, payout on buyer receipt. Reach serious vintage Beanie Baby collectors.",
  alternates: { canonical: "/sell" },
  keywords: [
    "sell Beanie Babies",
    "list Beanie Baby for sale",
    "Beanie Baby marketplace seller",
    "Beanie Baby consignment",
    "where to sell Beanie Babies",
  ],
  openGraph: {
    title: "Sell Beanie Babies on Beanie Xchange",
    description:
      "List your authenticated Beanie Baby with COA + grade. Escrow payouts.",
    url: "/sell",
  },
};

export default async function SellPage() {
  const user = await requireUser();

  // First-time sellers get pointed at the guided wizard — but never forced
  // into it (redirecting would trap anyone who wants the full form).
  const listingCount = await prisma.listing.count({
    where: { sellerId: user.id, status: { not: "REMOVED" } },
  });

  return (
    <div className="space-y-4">
      {listingCount === 0 && (
        <div className="max-w-2xl mx-auto">
          <Link
            href="/sell/first"
            className="bx-panel p-4 flex items-center justify-between gap-3 hover:-translate-y-0.5 transition-transform"
            style={{
              background: "var(--bx-green-soft)",
              borderColor: "var(--bx-green)",
            }}
          >
            <span className="text-sm">
              <span className="font-bold text-[var(--bx-green)]">
                🧸 First listing?
              </span>{" "}
              <span className="text-ink">
                Try the guided wizard — one step at a time, about two minutes.
              </span>
            </span>
            <span className="font-semibold text-[var(--bx-green)] shrink-0">
              Start easy →
            </span>
          </Link>
        </div>
      )}
      <SellWizard userName={user.name} createListing={createListing} />
    </div>
  );
}
