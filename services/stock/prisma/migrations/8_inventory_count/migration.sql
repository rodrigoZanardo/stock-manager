-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountItem" (
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "counted" INTEGER,

    CONSTRAINT "InventoryCountItem_pkey" PRIMARY KEY ("countId","productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_number_key" ON "InventoryCount"("number");

-- AddForeignKey
ALTER TABLE "InventoryCountItem" ADD CONSTRAINT "InventoryCountItem_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountItem" ADD CONSTRAINT "InventoryCountItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
