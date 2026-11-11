ALTER TABLE "SupplierSettlementRecord"
ADD COLUMN "productTitleSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "quantitySnapshot" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "saleTotalSnapshot" BIGINT,
ADD COLUMN "payableTotalSnapshot" BIGINT NOT NULL DEFAULT 0;

UPDATE "SupplierSettlementRecord" AS settlement
SET
  "productTitleSnapshot" = product."title",
  "quantitySnapshot" = product."quantity",
  "saleTotalSnapshot" = product."saleUnitPrice" * product."quantity",
  "payableTotalSnapshot" = COALESCE(product."supplyUnitCost", 0) * product."quantity"
FROM "DriverProduct" AS product
WHERE product."id" = settlement."productId";

ALTER TABLE "SupplierSettlementRecord"
ALTER COLUMN "productTitleSnapshot" DROP DEFAULT,
ALTER COLUMN "quantitySnapshot" DROP DEFAULT,
ALTER COLUMN "payableTotalSnapshot" DROP DEFAULT;
