-- Add rideEarnRate (모든 유저 대리 이용 시 10% 적립)
ALTER TABLE "accumulation_settings" ADD COLUMN "rideEarnRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10;
