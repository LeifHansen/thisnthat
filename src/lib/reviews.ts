import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// Verified-buyer reviews. Only the account buyer of a COMPLETED order can
// review, once per order — this is what makes the listing pages' JSON-LD
// aggregateRating/review fields honest (Google requires genuine user reviews;
// see prisma ProductReview). Guest-checkout orders have no account to attach
// a review to and are intentionally excluded.
//
// `sellerId` is denormalized onto the review from the order at write time so
// a seller's rating can be read straight off the table (getSellerRating) for
// cards, listing pages and profiles.

export type ReviewResult = { ok: boolean; error?: string };

export async function submitReview(formData: FormData): Promise<ReviewResult> {
  "use server";
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in required." };

  const orderId = String(formData.get("orderId") ?? "");
  const rating = Math.trunc(Number(formData.get("rating")));
  const body = String(formData.get("body") ?? "")
    .trim()
    .slice(0, 2000);

  if (!orderId) return { ok: false, error: "Missing order." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Pick a star rating (1–5)." };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      status: true,
      listingId: true,
    },
  });
  if (!order || order.buyerId !== session.user.id) {
    return { ok: false, error: "Order not found." };
  }
  if (order.status !== "COMPLETED") {
    return { ok: false, error: "You can review once the order is completed." };
  }

  try {
    await prisma.productReview.create({
      data: {
        orderId: order.id,
        buyerId: session.user.id,
        listingId: order.listingId,
        sellerId: order.sellerId,
        rating,
        body: body || null,
      },
    });
  } catch {
    // Unique orderId violation — double submit or already reviewed.
    return { ok: false, error: "You've already reviewed this order." };
  }

  revalidatePath(`/orders/${order.id}`);
  revalidatePath(`/listings/${order.listingId}`);
  revalidatePath(`/u/${order.sellerId}`);
  return { ok: true };
}

export type SellerRating = {
  /** Mean star rating (1–5), or null when the seller has no reviews yet. */
  avg: number | null;
  count: number;
};

/**
 * A seller's aggregate rating across every verified-buyer review they have
 * received. Reads the denormalized `sellerId` column, so it costs one indexed
 * aggregate regardless of how many listings the seller has.
 */
export async function getSellerRating(sellerId: string): Promise<SellerRating> {
  const agg = await prisma.productReview.aggregate({
    where: { sellerId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const count = agg._count._all;
  return {
    avg: count > 0 && agg._avg.rating != null ? agg._avg.rating : null,
    count,
  };
}
