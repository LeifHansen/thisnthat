-- Production hardening: composite indexes for the hot read paths, and a
-- uniqueness guarantee that a cart can hold at most one order per listing
-- (making a retried checkout POST unable to double-create orders).

-- DropIndex
DROP INDEX "ForumPost_threadId_idx";

-- DropIndex
DROP INDEX "Offer_status_idx";

-- DropIndex
DROP INDEX "Order_buyerId_idx";

-- DropIndex
DROP INDEX "Order_sellerId_idx";

-- DropIndex
DROP INDEX "Order_status_idx";

-- CreateIndex
CREATE INDEX "ForumPost_threadId_score_idx" ON "ForumPost"("threadId", "score");

-- CreateIndex
CREATE INDEX "Listing_status_isLot_createdAt_idx" ON "Listing"("status", "isLot", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_readAt_idx" ON "Message"("conversationId", "readAt");

-- CreateIndex
CREATE INDEX "Offer_status_expiresAt_idx" ON "Offer"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Order_buyerId_createdAt_idx" ON "Order"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_sellerId_createdAt_idx" ON "Order"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_cartId_listingId_key" ON "Order"("cartId", "listingId");

-- CreateIndex
CREATE INDEX "RegistryEntry_bxCertId_idx" ON "RegistryEntry"("bxCertId");

-- CreateIndex
CREATE INDEX "ShipmentEvent_trackingNumber_createdAt_idx" ON "ShipmentEvent"("trackingNumber", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentEvent_orderId_idx" ON "ShipmentEvent"("orderId");

-- CreateIndex
CREATE INDEX "ShipmentEvent_authRequestId_idx" ON "ShipmentEvent"("authRequestId");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
