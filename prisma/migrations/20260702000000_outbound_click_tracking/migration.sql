-- Outbound partner-link click tracking. Tracked egress links (currently the
-- True Blue Beans link, via /out/true-blue) insert one row per click; the
-- superadmin dashboard reports the all-time count.
CREATE TABLE "OutboundClick" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundClick_target_createdAt_idx" ON "OutboundClick"("target", "createdAt");
