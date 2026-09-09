import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { SITE_NAME } from "@/lib/site";
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
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { shipFromPostalCode: true },
  });

  return (
    <SellWizard
      userName={user.name}
      shipFromPostalCode={profile?.shipFromPostalCode ?? null}
      createListing={createListing}
    />
  );
}
