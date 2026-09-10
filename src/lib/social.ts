"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import * as notify from "@/lib/notify";

/**
 * Like / unlike a listing. Presence of a ListingLike row = liked, so the
 * toggle is a find-then-create-or-delete keyed on @@unique([userId,
 * listingId]) — a concurrent double-submit hits the constraint and is
 * swallowed as a no-op.
 *
 * Signed-out users are handled in the UI (LikeButton renders a sign-in
 * link instead of the form), so the action just bails.
 */
export async function toggleListingLike(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;

  const listingId = String(formData.get("listingId") ?? "").trim();
  if (!listingId) return;
  const userId = session.user.id;

  try {
    const existing = await prisma.listingLike.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });
    if (existing) {
      await prisma.listingLike.delete({ where: { id: existing.id } });
    } else {
      await prisma.listingLike.create({ data: { userId, listingId } });
    }
  } catch {
    // Duplicate create from a double-submit, or the listing was deleted
    // mid-flight — either way the end state is consistent; nothing to surface.
  }

  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/dashboard");
}

/** Follow / unfollow another seller's store. Self-follows are ignored. */
export async function toggleFollow(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;

  const followedId = String(formData.get("userId") ?? "").trim();
  const followerId = session.user.id;
  if (!followedId || followedId === followerId) return;

  try {
    const existing = await prisma.follow.findUnique({
      where: { followerId_followedId: { followerId, followedId } },
    });
    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
    } else {
      // Guard against following a user that doesn't exist / is suspended —
      // the FK covers existence; suspended profiles 404 publicly anyway.
      await prisma.follow.create({ data: { followerId, followedId } });
      // Only on a *new* follow — email the store owner (gated on notifySocial).
      void notify.newFollower(followerId, followedId);
    }
  } catch {
    // Double-submit or deleted user — no-op.
  }

  revalidatePath(`/u/${followedId}`);
  revalidatePath("/dashboard");
}
