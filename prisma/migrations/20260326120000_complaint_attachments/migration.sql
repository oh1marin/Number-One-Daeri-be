-- 불편신고: 첨부(JSON) + 목록 정렬용 인덱스
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "attachments" JSONB;
CREATE INDEX IF NOT EXISTS "complaints_createdAt_idx" ON "complaints" ("createdAt");
