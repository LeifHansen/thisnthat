import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { FirstListingWizard } from "@/components/FirstListingWizard";

export const metadata: Metadata = {
  title: "Add your first listing",
  description:
    "A guided, two-minute wizard for listing your first Beanie Baby on Beanie Xchange.",
  robots: { index: false, follow: false },
};

export default async function FirstListingPage() {
  const user = await requireUser();

  // The wizard is for first-timers. Anyone who has listed before (drafts
  // count — they've seen the flow) gets the full form instead.
  const listingCount = await prisma.listing.count({
    where: { sellerId: user.id, status: { not: "REMOVED" } },
  });
  if (listingCount > 0) redirect("/sell");

  return <FirstListingWizard userName={user.name} />;
}
