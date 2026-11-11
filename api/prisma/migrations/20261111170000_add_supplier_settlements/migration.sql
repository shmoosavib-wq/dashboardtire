CREATE TABLE "SupplierSettlementRecord" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "storeName" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "registeredById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierSettlementRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierSettlementRecord_productId_settledAt_idx" ON "SupplierSettlementRecord"("productId", "settledAt");
CREATE INDEX "SupplierSettlementRecord_settledAt_idx" ON "SupplierSettlementRecord"("settledAt");

ALTER TABLE "SupplierSettlementRecord" ADD CONSTRAINT "SupplierSettlementRecord_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "DriverProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierSettlementRecord" ADD CONSTRAINT "SupplierSettlementRecord_registeredById_fkey"
FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
