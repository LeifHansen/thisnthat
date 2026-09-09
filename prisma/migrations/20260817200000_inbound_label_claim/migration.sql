-- Prepaid inbound authentication labels: a batch-wide claim flag taken in one
-- atomic statement before buying postage, so a retried Stripe webhook can
-- never buy a real label twice.

-- AlterTable
ALTER TABLE "AuthenticationRequest" ADD COLUMN     "inboundLabelClaimed" BOOLEAN NOT NULL DEFAULT false;

