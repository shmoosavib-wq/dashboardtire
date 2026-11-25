-- Improve dashboard filters for paid installments and unpaid due-date ranges.
CREATE INDEX "DriverInstallment_paidAt_dueAt_idx" ON "DriverInstallment"("paidAt", "dueAt");
CREATE INDEX "AuditEvent_eventType_driverId_createdAt_id_idx" ON "AuditEvent"("eventType", "driverId", "createdAt", "id");
