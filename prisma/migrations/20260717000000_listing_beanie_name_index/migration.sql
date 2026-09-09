-- CreateIndex
-- Serves getOtherOptions(): filters ACTIVE listings by beanieName ordered by
-- price on every listing-detail render, previously a full Listing scan.
CREATE INDEX "Listing_beanieName_status_priceCents_idx" ON "Listing"("beanieName", "status", "priceCents");
