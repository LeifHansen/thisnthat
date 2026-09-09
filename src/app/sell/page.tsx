import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { SITE_NAME } from "@/lib/site";
import { canPublish } from "@/lib/sellerEligibility";
import { SellWizard } from "@/components/SellWizard";
import { createListing } from "./actions";

export const metadata: Metadata = {
  title: `Sell on ${SITE_NAME} — list anything in minutes`,
  description:
    "List anything you own — clothes, shoes, collectibles, electronics, art, books and more. Photos first, AI drafts the rest. You're paid out when the buyer confirms delivery.",
  alternates: { canonical: "/sell" },
  openGraph: {
    title: `Sell on ${SITE_NAME}`,
    description:
      "List anything in minutes. Set your price, ship direct, get paid on delivery.",
    url: "/sell",
  },
};

export default async function SellPage() {
  const user = await requireUser();

  // The seller's ship-from ZIP drives live-rated shipping at checkout; the
  // wizard shows it (or a nudge to add one) on its shipping step.
  const [profile, mayPublish] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { shipFromPostalCode: true },
    }),
    // Publishing is gated on payouts being enabled; the wizard says so up
    // front instead of surprising the seller after they press Post.
    canPublish(user.id),
  ]);

  return (
    <SellWizard
      userName={user.name}
      shipFromPostalCode={profile?.shipFromPostalCode ?? null}
      canPublish={mayPublish}
      createListing={createListing}
    />
  );
}
