CREATE TABLE IF NOT EXISTS "gifticon_orders" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "goodsCode" TEXT NOT NULL,
  "goodsName" TEXT NOT NULL,
  "brandName" TEXT,
  "imageUrl" TEXT,
  "price" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "giftishowTrId" TEXT,
  "giftishowSendBasicCd" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  CONSTRAINT "gifticon_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gifticon_orders_giftishowTrId_key" ON "gifticon_orders"("giftishowTrId");
CREATE INDEX IF NOT EXISTS "gifticon_orders_userId_idx" ON "gifticon_orders"("userId");
CREATE INDEX IF NOT EXISTS "gifticon_orders_userId_createdAt_idx" ON "gifticon_orders"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "gifticon_orders_status_idx" ON "gifticon_orders"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gifticon_orders_userId_fkey'
  ) THEN
    ALTER TABLE "gifticon_orders"
      ADD CONSTRAINT "gifticon_orders_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
