-- One-time "list your first beanie" nudge: a per-user sent marker (doubles as
-- the sweep's idempotency claim) and a dedicated "tips & nudges" opt-out
-- category, separate from transactional notification prefs.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstListingNudgeSentAt" TIMESTAMP(3),
ADD COLUMN     "notifyTips" BOOLEAN NOT NULL DEFAULT true;
