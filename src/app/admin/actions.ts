"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSuperadmin, isSuperadmin } from "@/lib/guards";

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
 * Hard-delete a user. Superadmin only. Refuses accounts with financial history
 * (orders, listings, authentication requests, registry entries) to preserve
 * integrity — suspend those instead. For empty/spam accounts, clears lightweight
 * child records then deletes.
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
          authRequests: true,
          registry: true,
        },
      },
    },
  });
  if (!target) backTo("error", "User not found.");
  if (isSuperadmin(target)) backTo("error", "Can't delete the superadmin.");

  const c = target._count;
  if (c.buyerOrders || c.sellerOrders || c.listings || c.authRequests || c.registry) {
    backTo(
      "error",
      `${target.name} has marketplace history (orders/listings/auth) — suspend instead of deleting to preserve records.`,
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.forumVote.deleteMany({ where: { userId } });
      await tx.forumPost.deleteMany({ where: { authorId: userId } });
      await tx.forumThread.deleteMany({ where: { authorId: userId } });
      await tx.offer.deleteMany({ where: { buyerId: userId } });
      await tx.tradeOffer.deleteMany({
        where: { OR: [{ proposerId: userId }, { ownerId: userId }] },
      });
      await tx.message.deleteMany({ where: { senderId: userId } });
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
