-- CreateTable
CREATE TABLE "DriverInstallment" (
    "id" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DriverInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverInstallment_driverId_number_key" ON "DriverInstallment"("driverId", "number");
CREATE INDEX "DriverInstallment_driverId_dueAt_idx" ON "DriverInstallment"("driverId", "dueAt");

-- AddForeignKey
ALTER TABLE "DriverInstallment" ADD CONSTRAINT "DriverInstallment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverInstallment" ADD CONSTRAINT "DriverInstallment_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
