import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { firstRealPhoto } from "@/lib/photos";
import { CheckoutSeeder } from "./CheckoutSeeder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

// Legacy single-item checkout URL. We now run a unified cart checkout, so this
// just drops the item into the cart and forwards to /checkout (keeps old
// "Buy Now" links and bookmarks working).
export default async function CheckoutByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) notFound();
  if (listing.status !== "ACTIVE") redirect(`/listings/${id}`);

  const photo = firstRealPhoto(listing.photos);
  return (
    <CheckoutSeeder
      item={{
        listingId: listing.id,
        title: listing.title,
        priceCents: listing.priceCents,
        photo,
        sellerId: listing.sellerId,
      }}
    />
  );
}
