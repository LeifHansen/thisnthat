"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// Verified-buyer reviews. Only the account buyer of a COMPLETED order can
// review, once per order — this is what makes the listing pages' JSON-LD
// aggregateRating/review fields honest (Google requires genuine user reviews;
// see prisma ProductReview). Guest-checkout orders have no account to attach
// a review to and are intentionally excluded.

export type ReviewResult = { ok: boolean; error?: string };

export async function submitReview(formData: FormData): Promise<ReviewResult> {
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
      status: true,
      listingId: true,
      listing: { select: { beanieName: true } },
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
        beanieName: order.listing.beanieName,
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
  return { ok: true };
}
