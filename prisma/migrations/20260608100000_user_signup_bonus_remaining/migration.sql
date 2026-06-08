-- 신규 가입 보너스(대리 전용) 잔여 — 기존 회원은 0 (기프티콘 제한 없음)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signupBonusRemaining" INTEGER NOT NULL DEFAULT 0;
