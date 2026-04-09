import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

async function ensureAdsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ads" (
      "id" TEXT PRIMARY KEY,
      "title" TEXT,
      "imageUrl" TEXT NOT NULL DEFAULT '',
      "content" TEXT NOT NULL DEFAULT '',
      "linkUrl" TEXT NOT NULL DEFAULT '',
      "shareText" TEXT NOT NULL DEFAULT '',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAdsItems() {
  // 앱: 광고 설정은 여러 개를 렌더링할 수 있어야 합니다.
  await ensureAdsTable();
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      title: string | null;
      imageUrl: string | null;
      content: string;
      linkUrl: string | null;
      shareText: string | null;
      updatedAt: Date;
    }>
  >`
    SELECT
      "id",
      "title",
      "imageUrl",
      "content",
      "linkUrl",
      "shareText",
      "updatedAt"
    FROM "ads"
    ORDER BY "updatedAt" DESC NULLS LAST
  `;

  // legacy 폴백: ad_settings(ad-min 단일) 테이블에 값이 남아있다면 그걸 1개 items로 반환
  if (rows.length > 0) {
    return rows.map((r) => ({
      id: r.id,
      title: r.title ?? undefined,
      imageUrl: r.imageUrl ?? '',
      content: r.content ?? '',
      linkUrl: r.linkUrl ?? '',
      shareText: r.shareText ?? '',
      updatedAt: r.updatedAt ?? null,
    }));
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ad_settings" (
      "id" TEXT PRIMARY KEY,
      "imageUrl" TEXT,
      "content" TEXT NOT NULL,
      "linkUrl" TEXT,
      "shareText" TEXT,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
    );
  `);

  const legacyRows = await prisma.$queryRaw<
    Array<{
      id: string;
      title: string | null;
      imageUrl: string | null;
      content: string;
      linkUrl: string | null;
      shareText: string | null;
      updatedAt: Date;
    }>
  >`
    SELECT
      "id",
      null as "title",
      "imageUrl",
      "content",
      "linkUrl",
      "shareText",
      "updatedAt"
    FROM "ad_settings"
    ORDER BY "updatedAt" DESC NULLS LAST
    LIMIT 1
  `;

  const top = legacyRows[0] ?? null;
  if (!top) return [];
  return [
    {
      id: top.id,
      title: top.title ?? undefined,
      imageUrl: top.imageUrl ?? '',
      content: top.content ?? '',
      linkUrl: top.linkUrl ?? '',
      shareText: top.shareText ?? '',
      updatedAt: top.updatedAt ?? null,
    },
  ];
}

// GET /ads — 앱 공개 광고설정
router.get('/', async (_req, res) => {
  try {
    const items = await getAdsItems();
    const top = items[0] ?? null;
    res.json({
      success: true,
      data: {
        // Flutter: 다건 렌더링용
        items,
        // 레거시/호환: 기존 단건 필드도 같이 내려준다
        imageUrl: top?.imageUrl ?? '',
        content: top?.content ?? '',
        linkUrl: top?.linkUrl ?? '',
        shareText: top?.shareText ?? '',
        updatedAt: top?.updatedAt ?? null,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;

