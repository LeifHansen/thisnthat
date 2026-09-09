-- BX in-house authentication (tier + grading), EasyPost shipping address,
-- and bulk-submission batching shipped in the schema (PR #29) but never had
-- a migration, so these columns/enum were missing in production. The dashboard
-- reads AuthenticationRequest.tier on load, which threw 'column does not exist'
-- and 500'd the whole page. This brings the database in line with the schema.
--
-- Written idempotently: production already had these columns applied out-of-band
-- via `prisma db push` during incident recovery, so every statement is guarded
-- to be a no-op when the object already exists. This lets `migrate deploy` run
-- the migration cleanly whether the target DB already has the changes (prod) or
-- is brand new (fresh/CI), without a manual `migrate resolve` baseline step.

-- CreateEnum (guarded: may already exist from the recovery db push)
DO $$ BEGIN
  CREATE TYPE "AuthTier" AS ENUM ('BASIC', 'FULL_GRADING');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- DropForeignKey
ALTER TABLE "ForumVote" DROP CONSTRAINT IF EXISTS "ForumVote_userId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_buyerId_fkey";

-- AlterTable
ALTER TABLE "AuthenticationRequest" ADD COLUMN IF NOT EXISTS "batchId" TEXT,
ADD COLUMN IF NOT EXISTS "gradeScores" JSONB,
ADD COLUMN IF NOT EXISTS "shipCity" TEXT,
ADD COLUMN IF NOT EXISTS "shipLine1" TEXT,
ADD COLUMN IF NOT EXISTS "shipLine2" TEXT,
ADD COLUMN IF NOT EXISTS "shipName" TEXT,
ADD COLUMN IF NOT EXISTS "shipPostalCode" TEXT,
ADD COLUMN IF NOT EXISTS "shipState" TEXT,
ADD COLUMN IF NOT EXISTS "tier" "AuthTier";

-- AlterTable
ALTER TABLE "RegistryEntry" ALTER COLUMN "grade" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ShipmentEvent" ADD COLUMN IF NOT EXISTS "labelUrl" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuthenticationRequest_batchId_idx" ON "AuthenticationRequest"("batchId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumVote" ADD CONSTRAINT "ForumVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
