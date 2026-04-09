-- Coupon: display fields
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- UserCoupon: received vs used
ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "user_coupons" SET "createdAt" = "usedAt" WHERE "usedAt" IS NOT NULL;

ALTER TABLE "user_coupons" ALTER COLUMN "usedAt" DROP NOT NULL;
UPDATE "user_coupons" SET "usedAt" = NULL;

CREATE INDEX IF NOT EXISTS "user_coupons_createdAt_idx" ON "user_coupons" ("createdAt");

-- Cash receipts
CREATE TABLE IF NOT EXISTS "cash_receipts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rideId" TEXT,
    "identifier" TEXT NOT NULL,
    "identifierType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cash_receipts_userId_idx" ON "cash_receipts" ("userId");
CREATE INDEX IF NOT EXISTS "cash_receipts_issuedAt_idx" ON "cash_receipts" ("issuedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_receipts_userId_fkey'
  ) THEN
    ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
