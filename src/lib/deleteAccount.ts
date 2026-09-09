import "server-only";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

/**
 * Self-serve account deletion.
 *
 * Apple requires an app that creates accounts to let people delete them from
 * inside the app (Guideline 5.1.1(v)). The only deletion this codebase had was
 * the superadmin one in src/app/admin/actions.ts, which refuses for any user
 * with marketplace history and says to suspend instead — correct for a hard
 * delete, since most of User's relations carry no `onDelete: Cascade` and
 * `prisma.user.delete` simply throws.
 *
 * So the row survives as a scrubbed tombstone. Orders and listings reference
 * it and are the *counterparty's* record of a real transaction — the person on
 * the other side of a sale does not lose their history because someone left.
 * Apple explicitly allows retaining what a transaction record requires. What
 * goes is everything personal and everything the account said.
 *
 * The tombstone is inert without any new checks: it sets `suspended`, which
 * the Auth.js session callback and getMobileUser already refuse.
 */

/** Orders where money or goods are still moving. */
const IN_FLIGHT_STATUSES = [
  "PENDING_PAYMENT",
  "PAID_ESCROW",
  "AWAITING_SHIP_TO_BUYER",
  "SHIPPED_TO_BUYER",
] as const;

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: "in_flight_orders" | "superadmin"; message: string };

/**
 * Whether this account can be deleted right now, and why not if it can't.
 * Exported so the UI can warn before the confirmation rather than after.
 */
export async function accountDeletionBlocker(
  userId: string,
): Promise<Extract<DeleteAccountResult, { ok: false }> | null> {
  const inFlight = await prisma.order.count({
    where: {
      OR: [{ buyerId: userId }, { sellerId: userId }],
      status: { in: [...IN_FLIGHT_STATUSES] },
    },
  });

  if (inFlight > 0) {
    // Deleting mid-escrow would strand somebody else's money or parcel. This
    // is a wait, not a refusal, and the message has to say so — Apple allows
    // an account-deletion flow to finish a pending transaction first, but not
    // to send people away without a route.
    return {
      ok: false,
      reason: "in_flight_orders",
      message:
        `You have ${inFlight} order${inFlight === 1 ? "" : "s"} still in progress. ` +
        "We can't delete your account while money is held in escrow or an item " +
        "is in transit — finish or cancel those first, or email " +
        "support@beaniexchange.com and we'll sort it out with you.",
    };
  }

  return null;
}

/**
 * Scrub the account. Idempotent: deleting an already-deleted account is a
 * no-op that still reports success, so a retried request can't 500.
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true, role: true },
  });
  if (!user) return { ok: true };
  if (user.deletedAt) return { ok: true };

  const blocker = await accountDeletionBlocker(userId);
  if (blocker) return blocker;

  // An unusable password, not an empty one: `authorize` compares against
  // whatever is stored, and a real hash of a random secret can never match.
  const deadHash = await bcrypt.hash(randomUUID(), 10);

  await prisma.$transaction(async (tx) => {
    // Things the account said. Conversations go with the messages so the other
    // party isn't left with an empty thread.
    await tx.forumVote.deleteMany({ where: { userId } });
    await tx.forumPost.deleteMany({ where: { authorId: userId } });
    await tx.forumThread.deleteMany({ where: { authorId: userId } });
    await tx.productReview.deleteMany({ where: { buyerId: userId } });
    await tx.message.deleteMany({ where: { senderId: userId } });
    await tx.conversation.deleteMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
    });

    // Things the account wanted. Open offers must go or a seller could accept
    // one from someone who no longer exists.
    await tx.offer.deleteMany({ where: { buyerId: userId } });
    await tx.tradeOffer.deleteMany({
      where: { OR: [{ proposerId: userId }, { ownerId: userId }] },
    });
    await tx.listingLike.deleteMany({ where: { userId } });
    await tx.follow.deleteMany({
      where: { OR: [{ followerId: userId }, { followedId: userId }] },
    });

    // Anything still for sale comes off the market. Suspension alone would
    // hide it, but a seller who deleted their account is not coming back to
    // ship it.
    await tx.listing.updateMany({
      where: { sellerId: userId, status: { in: ["ACTIVE", "DRAFT", "PENDING_AUTH"] } },
      data: { status: "REMOVED" },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        // `.invalid` is reserved by RFC 2606, so this can never collide with a
        // real address, and the id keeps the unique constraint satisfied.
        email: `deleted-${userId}@deleted.invalid`,
        passwordHash: deadHash,
        name: "Deleted user",
        displayName: null,
        bio: null,
        avatarUrl: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
        shipFromPostalCode: null,
        unsubscribeToken: null,
        notifyOrders: false,
        notifyOffers: false,
        notifyMessages: false,
        notifySocial: false,
        notifyTips: false,
        suspended: true,
        deletedAt: new Date(),
        // Deliberately kept: `stripeConnectId` is the destination
        // releaseEscrowFor() transfers a seller's proceeds to
        // (src/lib/payout.ts). Escrow on a COMPLETED order can still be
        // waiting to move, and clearing this would strand that money with no
        // way to route it. It identifies a Stripe account, not a person, and
        // the rest of the row no longer names anyone.
      },
    });
  });

  return { ok: true };
}
