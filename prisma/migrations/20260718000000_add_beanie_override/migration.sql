-- CreateTable
CREATE TABLE "BeanieOverride" (
    "id" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "name" TEXT,
    "animal" TEXT,
    "category" TEXT,
    "year" INTEGER,
    "styleNumber" TEXT,
    "valueLow" INTEGER,
    "valueHigh" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeanieOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BeanieOverride_normalizedKey_key" ON "BeanieOverride"("normalizedKey");
