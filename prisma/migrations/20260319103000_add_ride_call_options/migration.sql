-- Add ride call option fields (transmission/serviceType/quickBoard/vehicleType)
ALTER TABLE "rides" ADD COLUMN "transmission" TEXT;
ALTER TABLE "rides" ADD COLUMN "serviceType" TEXT;
ALTER TABLE "rides" ADD COLUMN "quickBoard" TEXT;
ALTER TABLE "rides" ADD COLUMN "vehicleType" TEXT;

