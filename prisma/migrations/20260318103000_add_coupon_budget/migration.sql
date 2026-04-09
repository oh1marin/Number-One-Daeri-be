-- CreateTable
CREATE TABLE "coupon_budgets" (
    "id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_budget_history" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_budget_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupon_budget_history_budgetId_idx" ON "coupon_budget_history"("budgetId");

-- CreateIndex
CREATE INDEX "coupon_budget_history_createdAt_idx" ON "coupon_budget_history"("createdAt");

-- AddForeignKey
ALTER TABLE "coupon_budget_history" ADD CONSTRAINT "coupon_budget_history_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "coupon_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

