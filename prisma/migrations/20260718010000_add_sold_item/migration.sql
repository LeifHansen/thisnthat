-- CreateTable
CREATE TABLE "SoldItem" (
    "id" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "beanieName" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT '$',
    "condition" TEXT,
    "buyingFormat" TEXT,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "link" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoldItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SoldItem_itemId_key" ON "SoldItem"("itemId");

-- CreateIndex
CREATE INDEX "SoldItem_normalizedKey_soldAt_idx" ON "SoldItem"("normalizedKey", "soldAt");

-- CreateIndex
CREATE INDEX "SoldItem_soldAt_idx" ON "SoldItem"("soldAt");
