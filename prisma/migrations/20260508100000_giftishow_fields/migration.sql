-- 기프티쇼 연동 필드
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "giftishowGoodsCode" TEXT;

ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "giftishowTrId" TEXT;
ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "giftishowSendBasicCd" TEXT;
ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "deliveryError" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "user_coupons_giftishowTrId_key" ON "user_coupons"("giftishowTrId");
