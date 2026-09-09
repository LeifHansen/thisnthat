-- Stripe Connect funnel timestamps.
--
-- `stripeConnectId` is written the moment the Express account is provisioned --
-- when the seller first clicks "Set Up Seller Payouts", before they have filled
-- in anything -- so counting non-null ids measures STARTS, not connections.
-- These two columns separate the two ends of the funnel so a low connect rate
-- can be told apart from a high abandon rate inside Stripe's own onboarding.
--
-- Both are nullable with no backfill: sellers who connected before this
-- migration keep null timestamps (their true dates are not recoverable from the
-- database), and the weekly series accumulates from deploy onward.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stripeConnectStartedAt" TIMESTAMP(3),
ADD COLUMN     "stripePayoutsEnabledAt" TIMESTAMP(3);
