-- CreateEnum
CREATE TYPE "BeanieSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "BeanieSubmission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "year" INTEGER,
    "submittedByName" TEXT,
    "firstListingId" TEXT,
    "status" "BeanieSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeanieSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BeanieSubmission_normalizedKey_key" ON "BeanieSubmission"("normalizedKey");

-- CreateIndex
CREATE INDEX "BeanieSubmission_status_idx" ON "BeanieSubmission"("status");
