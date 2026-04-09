-- Coupon delivery flow status fields on user_coupons

ALTER TABLE "user_coupons"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';

ALTER TABLE "user_coupons"
  ADD COLUMN IF NOT EXISTS "redeemedAt" TIMESTAMP(3);

ALTER TABLE "user_coupons"
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

-- Ensure existing rows have a non-null status
UPDATE "user_coupons"
  SET "status" = 'active'
  WHERE "status" IS NULL;

CREATE INDEX IF NOT EXISTS "user_coupons_status_idx" ON "user_coupons" ("status");
CREATE INDEX IF NOT EXISTS "user_coupons_redeemedAt_idx" ON "user_coupons" ("redeemedAt");
CREATE INDEX IF NOT EXISTS "user_coupons_deliveredAt_idx" ON "user_coupons" ("deliveredAt");

