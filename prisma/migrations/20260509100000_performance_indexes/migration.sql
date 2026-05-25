-- Performance indexes (Prisma schema sync; IF NOT EXISTS for idempotent deploy)

CREATE INDEX IF NOT EXISTS "users_deletedAt_idx" ON "users"("deletedAt");

CREATE INDEX IF NOT EXISTS "rides_createdAt_idx" ON "rides"("createdAt");
CREATE INDEX IF NOT EXISTS "rides_userId_status_idx" ON "rides"("userId", "status");
CREATE INDEX IF NOT EXISTS "rides_driverId_status_idx" ON "rides"("driverId", "status");

CREATE INDEX IF NOT EXISTS "user_coupons_status_idx" ON "user_coupons"("status");
CREATE INDEX IF NOT EXISTS "user_coupons_redeemedAt_idx" ON "user_coupons"("redeemedAt");

CREATE INDEX IF NOT EXISTS "phone_otps_phone_createdAt_idx" ON "phone_otps"("phone", "createdAt");
