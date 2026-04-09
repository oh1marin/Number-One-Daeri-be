-- AlterTable
ALTER TABLE "notices" ADD COLUMN "badge" TEXT DEFAULT '공지',
ADD COLUMN "badgeColor" TEXT DEFAULT 'bg-red-100 text-red-600',
ADD COLUMN "views" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "events" JSONB;
