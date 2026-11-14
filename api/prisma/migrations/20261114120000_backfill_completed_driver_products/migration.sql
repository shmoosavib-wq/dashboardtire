-- Restore product rows for completed legacy cases created before DriverProduct
-- records were persisted. Never overwrite a driver's existing product rows.
WITH legacy_products AS (
  SELECT
    driver."id" AS "driverId",
    draft."updatedAt" AS "createdAt",
    product.value AS item
  FROM "Driver" AS driver
  JOIN "StageDraft" AS draft
    ON draft."driverId" = driver."id"
   AND draft."stage" = 'PROFORMA_PAYMENT_RESERVATION'
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(draft."payload" -> 'products') = 'array'
        THEN draft."payload" -> 'products'
      ELSE '[]'::jsonb
    END
  ) AS product(value)
  WHERE driver."currentStage" = 'COMPLETED'
    AND NOT EXISTS (
      SELECT 1 FROM "DriverProduct" AS existing
      WHERE existing."driverId" = driver."id"
    )
    AND length(trim(COALESCE(product.value ->> 'title', ''))) > 0
    AND COALESCE(product.value ->> 'quantity', '') ~ '^[0-9]+$'
    AND (product.value ->> 'quantity')::numeric BETWEEN 1 AND 2147483647
    AND COALESCE(product.value ->> 'saleUnitPrice', '') ~ '^[0-9]+$'
    AND (product.value ->> 'saleUnitPrice')::numeric BETWEEN 1 AND 9223372036854775807
)
INSERT INTO "DriverProduct" (
  "id", "driverId", "title", "quantity", "saleUnitPrice", "supplyUnitCost", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  legacy."driverId",
  trim(legacy.item ->> 'title'),
  (legacy.item ->> 'quantity')::integer,
  (legacy.item ->> 'saleUnitPrice')::bigint,
  CASE
    WHEN COALESCE(legacy.item ->> 'supplyUnitCost', '') ~ '^[0-9]+$'
      AND (legacy.item ->> 'supplyUnitCost')::numeric BETWEEN 1 AND 9223372036854775807
      THEN (legacy.item ->> 'supplyUnitCost')::bigint
    ELSE NULL
  END,
  legacy."createdAt",
  CURRENT_TIMESTAMP
FROM legacy_products AS legacy;
