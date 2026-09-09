-- Guest checkout + cart grouping.
-- Buyer becomes optional (guests have no account); add guest contact/token
-- and a cartId that groups orders paid by a single PaymentIntent.

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "buyerId" DROP NOT NULL;
ALTER TABLE "Order" ADD COLUMN "guestEmail" TEXT;
ALTER TABLE "Order" ADD COLUMN "guestToken" TEXT;
ALTER TABLE "Order" ADD COLUMN "cartId" TEXT;

-- The buyer FK must allow NULL; recreate it as nullable-friendly (Postgres
-- keeps the existing FK working with NULLs, so no constraint change needed).

-- CreateIndex
CREATE UNIQUE INDEX "Order_guestToken_key" ON "Order"("guestToken");

-- CreateIndex
CREATE INDEX "Order_cartId_idx" ON "Order"("cartId");
