"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { deleteListing } from "@/lib/actions";
import { requireAdmin, requireSuperadmin, isSuperadmin } from "@/lib/guards";

function backTo(kind: "ok" | "error", msg: string): never {
  redirect(`/admin/users?${kind}=${encodeURIComponent(msg)}`);
}

/** Promote/demote a user between USER and ADMIN. Superadmin only. */
export async function setUserRole(formData: FormData) {
  await requireSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (role !== "USER" && role !== "ADMIN") backTo("error", "Invalid role.");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) backTo("error", "User not found.");
  if (isSuperadmin(target)) backTo("error", "Can't change the superadmin's role.");

  await prisma.user.update({ where: { id: userId }, data: { role: role as "USER" | "ADMIN" } });
  revalidatePath("/admin/users");
  backTo("ok", `${target.name} is now ${role}.`);
}

/**
 * Suspend or reinstate a user. Suspending blocks sign-in and pulls their
 * ACTIVE listings from the marketplace (set to REMOVED). Reinstating clears the
 * flag but does not auto-restore listings — the seller re-lists as needed.
 */
export async function setUserSuspended(formData: FormData) {
  await requireSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  const suspend = String(formData.get("suspend") ?? "") === "true";

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) backTo("error", "User not found.");
  if (isSuperadmin(target)) backTo("error", "Can't suspend the superadmin.");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { suspended: suspend } });
    if (suspend) {
      await tx.listing.updateMany({
        where: { sellerId: userId, status: "ACTIVE" },
        data: { status: "REMOVED" },
      });
    }
  });

  revalidatePath("/admin/users");
  backTo("ok", suspend ? `${target.name} suspended.` : `${target.name} reinstated.`);
}

/**
 * Hard-delete a user. Superadmin only. Refuses accounts with marketplace
 * history (orders, listings, offers, reviews, messages) to preserve the
 * counterparty's records — suspend those instead. For empty/spam accounts,
 * clears the lightweight child records then deletes; likes and follows
 * cascade on their own.
 */
export async function deleteUser(formData: FormData) {
  await requireSuperadmin();
  const userId = String(formData.get("userId") ?? "");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: {
          buyerOrders: true,
          sellerOrders: true,
          listings: true,
          offers: true,
          productReviews: true,
          sentMessages: true,
        },
      },
    },
  });
  if (!target) backTo("error", "User not found.");
  if (isSuperadmin(target)) backTo("error", "Can't delete the superadmin.");

  const c = target._count;
  if (
    c.buyerOrders ||
    c.sellerOrders ||
    c.listings ||
    c.offers ||
    c.productReviews ||
    c.sentMessages
  ) {
    backTo(
      "error",
      `${target.name} has marketplace history (orders/listings/offers/reviews/messages) — suspend instead of deleting to preserve records.`,
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // This account never sent a message (checked above), so the only thing
      // in these threads is the other party's side of an unanswered
      // conversation — it goes with the account rather than pointing at a
      // user who no longer exists.
      await tx.conversation.deleteMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
      });
      await tx.user.delete({ where: { id: userId } });
    });
  } catch (e) {
    console.error("admin: deleteUser failed", e);
    backTo("error", `Couldn't delete ${target.name} — linked records remain. Suspend instead.`);
  }

  revalidatePath("/admin/users");
  backTo("ok", `${target.name} deleted.`);
}

// --- Listing moderation --------------------------------------------------
// Both return a result instead of redirecting so the listings table can act
// on a row in place (ListingRowActions) and show the error next to it.

// Same shape as DeleteListingResult so removeListing can pass it straight through.
export type ListingActionResult = { ok: boolean; error?: string };

/**
 * Pull a listing from the marketplace. Any admin. Delegates to the shared
 * soft-delete (deleteListing sets REMOVED and leaves orders/offers intact).
 */
export async function removeListing(formData: FormData): Promise<ListingActionResult> {
  await requireAdmin();
  const res = await deleteListing(formData);
  if (res.ok) revalidatePath("/admin/listings");
  return res;
}

/**
 * Put a REMOVED listing back on sale. Any admin. Refuses when the seller can't
 * actually fulfil it — a suspended or deleted account, or no units left.
 */
export async function restoreListing(formData: FormData): Promise<ListingActionResult> {
  await requireAdmin();
  const id = String(formData.get("listingId") ?? "");
  if (!id) return { ok: false, error: "Missing listing." };

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: {
      status: true,
      quantity: true,
      seller: { select: { suspended: true, deletedAt: true } },
    },
  });
  if (!listing) return { ok: false, error: "Listing not found." };
  if (listing.status !== "REMOVED") {
    return { ok: false, error: "Only removed listings can be restored." };
  }
  if (listing.seller.deletedAt) {
    return { ok: false, error: "The seller deleted their account." };
  }
  if (listing.seller.suspended) {
    return { ok: false, error: "The seller is suspended — reinstate them first." };
  }
  if (listing.quantity < 1) {
    return { ok: false, error: "No units left to sell." };
  }

  await prisma.listing.update({ where: { id }, data: { status: "ACTIVE" } });
  revalidatePath("/admin/listings");
  revalidatePath(`/listings/${id}`);
  return { ok: true };
}
