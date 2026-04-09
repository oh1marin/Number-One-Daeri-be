-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "no" SERIAL NOT NULL,
    "registeredAt" DATE NOT NULL,
    "dmSend" BOOLEAN NOT NULL DEFAULT false,
    "smsSend" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "info" TEXT,
    "memberNo" TEXT,
    "address" TEXT,
    "addressDetail" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "otherPhone" TEXT,
    "notes" TEXT,
    "referrerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "no" SERIAL NOT NULL,
    "registeredAt" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "timeSlot" TEXT,
    "address" TEXT,
    "addressZip" TEXT,
    "addressDetail" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "licenseNo" TEXT,
    "residentNo" TEXT,
    "aptitudeTest" TEXT,
    "notes" TEXT,
    "password" TEXT,
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT,
    "customerId" TEXT,
    "userId" TEXT,
    "driverId" TEXT,
    "driverName" TEXT,
    "pickup" TEXT NOT NULL,
    "dropoff" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "addressDetail" TEXT,
    "destinationLatitude" DOUBLE PRECISION,
    "destinationLongitude" DOUBLE PRECISION,
    "destinationAddress" TEXT,
    "fareType" TEXT NOT NULL DEFAULT 'normal',
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "estimatedDistanceKm" DOUBLE PRECISION,
    "estimatedFare" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fare" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "extra" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "docNo" TEXT NOT NULL,
    "tradeDate" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "totalSupply" INTEGER NOT NULL,
    "totalVat" INTEGER NOT NULL,
    "totalAmt" INTEGER NOT NULL,
    "vatIncluded" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "supplyAmt" INTEGER NOT NULL DEFAULT 0,
    "vatRate" INTEGER NOT NULL DEFAULT 10,
    "vatAmt" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_settings" (
    "id" TEXT NOT NULL,
    "bizNo" TEXT,
    "companyName" TEXT,
    "ceoName" TEXT,
    "address" TEXT,
    "businessType" TEXT,
    "businessCategory" TEXT,
    "phone" TEXT,
    "itemKorean" BOOLEAN NOT NULL DEFAULT true,
    "specKorean" BOOLEAN NOT NULL DEFAULT true,
    "blankZeroQty" BOOLEAN NOT NULL DEFAULT false,
    "blankZeroSupply" BOOLEAN NOT NULL DEFAULT false,
    "printSpecAsUnit" BOOLEAN NOT NULL DEFAULT true,
    "printTradeDate" BOOLEAN NOT NULL DEFAULT false,
    "noDocNo" BOOLEAN NOT NULL DEFAULT false,
    "printFooter1" BOOLEAN NOT NULL DEFAULT true,
    "printFooter1Text" TEXT,
    "printFooter2" BOOLEAN NOT NULL DEFAULT false,
    "printFooter2Text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "extraSettings" JSONB,

    CONSTRAINT "invoice_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fare_settings" (
    "id" TEXT NOT NULL,
    "areas" JSONB NOT NULL,
    "fares" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fare_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "no" INTEGER,
    "email" TEXT,
    "password" TEXT,
    "name" TEXT NOT NULL DEFAULT '앱 사용자',
    "phone" TEXT,
    "mileageBalance" INTEGER NOT NULL DEFAULT 10000,
    "settings" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mileage_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mileage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "bankCode" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_cards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardToken" TEXT,
    "cardName" TEXT NOT NULL,
    "last4Digits" TEXT,
    "expiryDate" TEXT,
    "option" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_referrals" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "referrerReward" INTEGER NOT NULL DEFAULT 0,
    "referredReward" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrer_tier_bonuses" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrer_tier_bonuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_inquiries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_inquiry_messages" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_inquiry_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT,
    "content" TEXT NOT NULL,
    "rideId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_coupons" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accumulation_settings" (
    "id" TEXT NOT NULL,
    "signupBonus" INTEGER NOT NULL DEFAULT 10000,
    "referrerRegister" INTEGER NOT NULL DEFAULT 2000,
    "referrerFirstRide" INTEGER NOT NULL DEFAULT 3000,
    "referrerRideRate" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "cardPayRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accumulation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_guides" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '사용설명',
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_images" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counselors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "loginId" TEXT,
    "cid" TEXT,
    "password" TEXT,
    "permissions" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counselors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_login_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userType" TEXT NOT NULL,
    "email" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_login_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_otps" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_changes" (
    "id" TEXT NOT NULL,
    "phoneBefore" TEXT NOT NULL,
    "phoneAfter" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_adminId_idx" ON "refresh_tokens"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_no_key" ON "customers"("no");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_category_idx" ON "customers"("category");

-- CreateIndex
CREATE INDEX "customers_registeredAt_idx" ON "customers"("registeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_no_key" ON "drivers"("no");

-- CreateIndex
CREATE INDEX "drivers_name_idx" ON "drivers"("name");

-- CreateIndex
CREATE INDEX "drivers_region_idx" ON "drivers"("region");

-- CreateIndex
CREATE INDEX "drivers_registeredAt_idx" ON "drivers"("registeredAt");

-- CreateIndex
CREATE INDEX "drivers_isOnline_idx" ON "drivers"("isOnline");

-- CreateIndex
CREATE UNIQUE INDEX "driver_refresh_tokens_token_key" ON "driver_refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "driver_refresh_tokens_driverId_idx" ON "driver_refresh_tokens"("driverId");

-- CreateIndex
CREATE INDEX "rides_date_idx" ON "rides"("date");

-- CreateIndex
CREATE INDEX "rides_customerId_idx" ON "rides"("customerId");

-- CreateIndex
CREATE INDEX "rides_userId_idx" ON "rides"("userId");

-- CreateIndex
CREATE INDEX "rides_driverId_idx" ON "rides"("driverId");

-- CreateIndex
CREATE INDEX "rides_status_idx" ON "rides"("status");

-- CreateIndex
CREATE INDEX "attendance_driverId_idx" ON "attendance"("driverId");

-- CreateIndex
CREATE INDEX "attendance_year_month_idx" ON "attendance"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_driverId_year_month_day_key" ON "attendance"("driverId", "year", "month", "day");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_docNo_key" ON "invoices"("docNo");

-- CreateIndex
CREATE INDEX "invoices_tradeDate_idx" ON "invoices"("tradeDate");

-- CreateIndex
CREATE INDEX "invoices_type_idx" ON "invoices"("type");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "users_no_key" ON "users"("no");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_refresh_tokens_token_key" ON "user_refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "user_refresh_tokens_userId_idx" ON "user_refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "notices_createdAt_idx" ON "notices"("createdAt");

-- CreateIndex
CREATE INDEX "mileage_history_userId_idx" ON "mileage_history"("userId");

-- CreateIndex
CREATE INDEX "mileage_history_createdAt_idx" ON "mileage_history"("createdAt");

-- CreateIndex
CREATE INDEX "withdrawals_userId_idx" ON "withdrawals"("userId");

-- CreateIndex
CREATE INDEX "withdrawals_status_idx" ON "withdrawals"("status");

-- CreateIndex
CREATE INDEX "user_cards_userId_idx" ON "user_cards"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_referrals_referredId_key" ON "user_referrals"("referredId");

-- CreateIndex
CREATE INDEX "user_referrals_referrerId_idx" ON "user_referrals"("referrerId");

-- CreateIndex
CREATE INDEX "referrer_tier_bonuses_referrerId_idx" ON "referrer_tier_bonuses"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "referrer_tier_bonuses_referrerId_tier_key" ON "referrer_tier_bonuses"("referrerId", "tier");

-- CreateIndex
CREATE INDEX "user_inquiries_userId_idx" ON "user_inquiries"("userId");

-- CreateIndex
CREATE INDEX "user_inquiry_messages_inquiryId_idx" ON "user_inquiry_messages"("inquiryId");

-- CreateIndex
CREATE INDEX "complaints_userId_idx" ON "complaints"("userId");

-- CreateIndex
CREATE INDEX "contacts_createdAt_idx" ON "contacts"("createdAt");

-- CreateIndex
CREATE INDEX "faqs_sortOrder_idx" ON "faqs"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "user_coupons_userId_idx" ON "user_coupons"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_coupons_userId_couponId_key" ON "user_coupons"("userId", "couponId");

-- CreateIndex
CREATE INDEX "events_startAt_idx" ON "events"("startAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_images_key_key" ON "app_images"("key");

-- CreateIndex
CREATE UNIQUE INDEX "counselors_loginId_key" ON "counselors"("loginId");

-- CreateIndex
CREATE INDEX "user_login_logs_userId_idx" ON "user_login_logs"("userId");

-- CreateIndex
CREATE INDEX "user_login_logs_createdAt_idx" ON "user_login_logs"("createdAt");

-- CreateIndex
CREATE INDEX "phone_otps_phone_idx" ON "phone_otps"("phone");

-- CreateIndex
CREATE INDEX "number_changes_phoneBefore_idx" ON "number_changes"("phoneBefore");

-- CreateIndex
CREATE INDEX "number_changes_phoneAfter_idx" ON "number_changes"("phoneAfter");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_refresh_tokens" ADD CONSTRAINT "driver_refresh_tokens_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_refresh_tokens" ADD CONSTRAINT "user_refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mileage_history" ADD CONSTRAINT "mileage_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_referrals" ADD CONSTRAINT "user_referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_referrals" ADD CONSTRAINT "user_referrals_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrer_tier_bonuses" ADD CONSTRAINT "referrer_tier_bonuses_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_inquiries" ADD CONSTRAINT "user_inquiries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_inquiry_messages" ADD CONSTRAINT "user_inquiry_messages_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "user_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_coupons" ADD CONSTRAINT "user_coupons_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_coupons" ADD CONSTRAINT "user_coupons_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
