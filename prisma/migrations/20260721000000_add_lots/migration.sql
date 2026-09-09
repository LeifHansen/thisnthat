-- Lot listings: a single listing that bundles many beanies (a mix of different
-- beanies, or multiples of the same) sold together as one unit for one price.
-- `isLot` flags the listing; the bundle contents live in the LotItem table.

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "isLot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LotItem" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "beanieName" TEXT NOT NULL,
    "year" INTEGER,
    "styleNumber" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LotItem_listingId_idx" ON "LotItem"("listingId");

-- CreateIndex
CREATE INDEX "Listing_isLot_status_idx" ON "Listing"("isLot", "status");

-- AddForeignKey
ALTER TABLE "LotItem" ADD CONSTRAINT "LotItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
