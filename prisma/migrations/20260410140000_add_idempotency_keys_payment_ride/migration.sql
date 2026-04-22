-- AlterTable
ALTER TABLE "rides" ADD COLUMN "clientCallId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "rides_userId_clientCallId_key" ON "rides"("userId", "clientCallId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_userId_idempotencyKey_key" ON "payments"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_userId_pgTid_idx" ON "payments"("userId", "pgTid");
