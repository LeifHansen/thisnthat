import "server-only";
import { prisma } from "@/lib/db";
import * as notify from "@/lib/notify";

/**
 * One-time "list your first item" nudge: accounts that are at least
 * NUDGE_AFTER_DAYS old, have never created a listing, and haven't been
 * nudged before.
 *
 * Self-triggering — no external scheduler, no shared secret to configure.
 * Marketplace pages call the throttled `sweepFirstListingNudges()` below,
 * exactly like `sweepAbandonedReservations()` in lib/listings.ts.
 *
 * Batch-limited so the first rollout trickles out over successive sweeps
 * instead of blasting every historical no-listing account at once (a sudden
 * spike would hurt SendGrid sending reputation).
 */
const NUDGE_AFTER_DAYS = 14;

export async function sendFirstListingNudges(
  limit = 50,
): Promise<{ candidates: number; sent: number }> {
  const cutoff = new Date(Date.now() - NUDGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await prisma.user.findMany({
    where: {
      createdAt: { lt: cutoff },
      suspended: false,
      role: "USER",
      firstListingNudgeSentAt: null,
      // Opted out of tips & nudges = never a candidate (cheaper to filter
      // here than to claim rows notify would then refuse to mail).
      notifyTips: true,
      listings: { none: {} },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sent = 0;
  for (const u of candidates) {
    // Claim BEFORE sending: if two sweeps overlap or the process dies
    // mid-batch, a user can miss the nudge but can never receive it twice.
    const claimed = await prisma.user.updateMany({
      where: { id: u.id, firstListingNudgeSentAt: null },
      data: { firstListingNudgeSentAt: new Date() },
    });
    if (claimed.count === 0) continue;
    await notify.firstListingNudge(u.id);
    sent++;
  }
  return { candidates: candidates.length, sent };
}

// Throttle so a burst of page loads triggers at most one sweep per instance
// per window. Fire-and-forget: callers (marketplace pages) don't await it, so
// a page render is never slowed or failed by nudge mail.
let lastNudgeSweepAt = 0;

export function sweepFirstListingNudges(windowMs = 60 * 60_000): void {
  const now = Date.now();
  if (now - lastNudgeSweepAt < windowMs) return;
  lastNudgeSweepAt = now;
  void sendFirstListingNudges().catch((e) => {
    console.error("[nudges] first-listing sweep failed", e);
  });
}
