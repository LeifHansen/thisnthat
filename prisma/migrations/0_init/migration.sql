-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuthType" AS ENUM ('TRUE_BLUE', 'THIRD_PARTY_COA', 'BX_EXPRESS_COA', 'BX_FULL_SERVICE', 'UNAUTHENTICATED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_AUTH', 'ACTIVE', 'SOLD', 'REMOVED');

-- CreateEnum
CREATE TYPE "FulfillmentPath" AS ENUM ('DIRECT', 'VIA_HQ');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID_ESCROW', 'AWAITING_SHIP_TO_BUYER', 'SHIPPED_TO_BUYER', 'COMPLETED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuthServiceLevel" AS ENUM ('EXPRESS_COA', 'FULL_SERVICE');

-- CreateEnum
CREATE TYPE "AuthRequestStatus" AS ENUM ('REQUESTED', 'PAID', 'AWAITING_INBOUND', 'AT_CENTER', 'IN_REVIEW', 'PASSED', 'FAILED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ShipmentLeg" AS ENUM ('SUBMITTER_TO_CENTER', 'CENTER_TO_SUBMITTER', 'SELLER_TO_BUYER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "stripeConnectId" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'US',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "beanieName" TEXT NOT NULL,
    "year" INTEGER,
    "condition" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "photos" TEXT[],
    "authType" "AuthType" NOT NULL,
    "coaImageUrl" TEXT,
    "trueBlueCertId" TEXT,
    "bxCertId" TEXT,
    "grade" TEXT,
    "registrationNumber" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "itemCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL,
    "shipToBuyerCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "fulfillmentPath" "FulfillmentPath" NOT NULL DEFAULT 'DIRECT',
    "stripePaymentIntentId" TEXT,
    "stripeTransferId" TEXT,
    "shipName" TEXT NOT NULL,
    "shipLine1" TEXT NOT NULL,
    "shipLine2" TEXT,
    "shipCity" TEXT NOT NULL,
    "shipState" TEXT NOT NULL,
    "shipPostalCode" TEXT NOT NULL,
    "shipCountry" TEXT NOT NULL DEFAULT 'US',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthenticationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceLevel" "AuthServiceLevel" NOT NULL,
    "status" "AuthRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "beanieName" TEXT NOT NULL,
    "description" TEXT,
    "condition" TEXT,
    "photos" TEXT[],
    "serviceFeeCents" INTEGER NOT NULL,
    "inboundShipCents" INTEGER NOT NULL DEFAULT 0,
    "outboundShipCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "stripePaymentIntentId" TEXT,
    "grade" TEXT,
    "bxCertId" TEXT,
    "registrationNumber" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "listingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthenticationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryEntry" (
    "id" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "bxCertId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "authRequestId" TEXT,
    "leg" "ShipmentLeg" NOT NULL,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "Listing_sellerId_idx" ON "Listing"("sellerId");

-- CreateIndex
CREATE INDEX "Listing_authType_status_idx" ON "Listing"("authType", "status");

-- CreateIndex
CREATE INDEX "Order_buyerId_idx" ON "Order"("buyerId");

-- CreateIndex
CREATE INDEX "Order_sellerId_idx" ON "Order"("sellerId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AuthenticationRequest_listingId_key" ON "AuthenticationRequest"("listingId");

-- CreateIndex
CREATE INDEX "AuthenticationRequest_userId_idx" ON "AuthenticationRequest"("userId");

-- CreateIndex
CREATE INDEX "AuthenticationRequest_status_idx" ON "AuthenticationRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RegistryEntry_registrationNumber_key" ON "RegistryEntry"("registrationNumber");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthenticationRequest" ADD CONSTRAINT "AuthenticationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthenticationRequest" ADD CONSTRAINT "AuthenticationRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryEntry" ADD CONSTRAINT "RegistryEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_authRequestId_fkey" FOREIGN KEY ("authRequestId") REFERENCES "AuthenticationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

