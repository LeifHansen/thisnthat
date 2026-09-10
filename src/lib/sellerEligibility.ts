import "server-only";
import { prisma } from "@/lib/db";
import { getPayoutState } from "@/lib/payout";

/**
 * Can this seller publish (ACTIVE) a listing right now?
 *
 * A listing goes live only when the seller's Stripe Connect account has
 * payouts enabled — otherwise a buyer could pay for something whose proceeds
 * have nowhere to go. Drafts are always allowed, so a seller can prepare
 * listings before finishing onboarding.
 *
 * `stripePayoutsEnabledAt` is stamped by getPayoutState() the first time
 * Stripe reports the account enabled; if it is still null but an account
 * exists, ask Stripe once here so a seller who just finished onboarding is not
 * bounced back to their dashboard to "refresh" before publishing.
 *
 * When Stripe is not configured at all (no STRIPE_SECRET_KEY — local dev,
 * preview builds) there is no checkout either, so the gate is open: nothing
 * can be paid for, and blocking publishing would only make the sandbox
 * useless. In production Stripe is always configured, so the gate applies.
 */
export type PublishEligibility =
  | { ok: true }
  | { ok: false; reason: "payouts"; message: string };

export const PAYOUTS_REQUIRED_MESSAGE =
  "Set up seller payouts before publishing — buyers can't pay for a listing whose proceeds have nowhere to go. Your listing is saved as a draft.";

export async function publishEligibility(
  userId: string,
): Promise<PublishEligibility> {
  if (!process.env.STRIPE_SECRET_KEY) return { ok: true };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, stripeConnectId: true, stripePayoutsEnabledAt: true },
  });
  if (!user) return { ok: false, reason: "payouts", message: PAYOUTS_REQUIRED_MESSAGE };
  if (user.stripePayoutsEnabledAt) return { ok: true };

  if (user.stripeConnectId) {
    const state = await getPayoutState(user).catch(() => null);
    if (state?.status === "enabled") return { ok: true };
  }
  return { ok: false, reason: "payouts", message: PAYOUTS_REQUIRED_MESSAGE };
}

/** Convenience for pages that only need a boolean for a banner. */
export async function canPublish(userId: string): Promise<boolean> {
  return (await publishEligibility(userId)).ok;
}
