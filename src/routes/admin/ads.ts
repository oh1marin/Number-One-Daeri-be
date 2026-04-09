import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import crypto from 'crypto';

const router = Router();
const LEGACY_SINGLE_ID = "__legacy__";

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

async function ensureAdSettingsTable() {
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
}

async function getLatestAdSettingsIfAny() {
  await ensureAdSettingsTable();
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      imageUrl: string | null;
      content: string;
      linkUrl: string | null;
      shareText: string | null;
      updatedAt: Date;
    }>
  >`
    SELECT
      "id",
      "imageUrl",
      "content",
      "linkUrl",
      "shareText",
      "updatedAt"
    FROM "ad_settings"
    ORDER BY "updatedAt" DESC NULLS LAST
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function getAdsItems() {
  await ensureAdsTable();
  const items = await prisma.$queryRaw<
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
  return items.map((x) => ({
    id: x.id,
    title: x.title ?? undefined,
    imageUrl: x.imageUrl ?? "",
    content: x.content ?? "",
    linkUrl: x.linkUrl ?? "",
    shareText: x.shareText ?? "",
    updatedAt: x.updatedAt ?? null,
  }));
}

async function migrateLegacyIfAdsEmpty() {
  const items = await getAdsItems();
  if (items.length > 0) return items;

  const legacy = await getLatestAdSettingsIfAny();
  if (!legacy) return [];

  // ad_settings(레거시 단일) 내용을 ads(다건)로 마이그레이션
  const id = LEGACY_SINGLE_ID;
  const imageUrlVal = legacy.imageUrl ?? "";
  const contentVal = legacy.content ?? "";
  const linkUrlVal = legacy.linkUrl ?? "";
  const shareTextVal = legacy.shareText ?? "";

  await prisma.$executeRaw`DELETE FROM "ads" WHERE "id" = ${id}`;
  await prisma.$executeRaw`
    INSERT INTO "ads" ("id","title","imageUrl","content","linkUrl","shareText","updatedAt")
    VALUES (${id}, ${null}, ${imageUrlVal}, ${contentVal}, ${linkUrlVal}, ${shareTextVal}, NOW())
  `;

  // 레거시 단일 데이터를 계속 유지하면, GET에서 다시 마이그레이션되어 삭제가 무시되는 문제가 생김
  await prisma.$executeRaw`DELETE FROM "ad_settings"`;

  return getAdsItems();
}

async function getOrCreateAdSettings() {
  // NOTE:
  // Prisma Client를 재생성하지 못한 상태에서는 `prisma.adSettings` 모델이 undefined일 수 있습니다.
  // 또한 현재 DB에 `ad_settings` 테이블이 없을 수 있어, 먼저 생성 후 조회/생성합니다.

  // ad_settings 테이블이 없을 경우 대비 (PostgreSQL)
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

  const existing = await prisma.$queryRaw<
    Array<{
      id: string;
      imageUrl: string | null;
      content: string;
      linkUrl: string | null;
      shareText: string | null;
      updatedAt: Date;
    }>
  >`
    SELECT
      "id",
      "imageUrl",
      "content",
      "linkUrl",
      "shareText",
      "updatedAt"
    FROM "ad_settings"
    ORDER BY "updatedAt" DESC NULLS LAST
    LIMIT 1
  `;

  if (existing?.[0]) return existing[0];

  const id = crypto.randomUUID();

  const created = await prisma.$queryRaw<
    Array<{
      id: string;
      imageUrl: string | null;
      content: string;
      linkUrl: string | null;
      shareText: string | null;
      updatedAt: Date;
    }>
  >`
    INSERT INTO "ad_settings" ("id","content","imageUrl","linkUrl","shareText","updatedAt")
    VALUES (${id}, ${''}, ${null}, ${null}, ${null}, NOW())
    RETURNING
      "id",
      "imageUrl",
      "content",
      "linkUrl",
      "shareText",
      "updatedAt"
  `;

  return created[0];
}

// GET /admin/ads — 광고설정 목록 (A: data.items)
router.get('/', async (_req, res) => {
  try {
    const items = await migrateLegacyIfAdsEmpty();
    res.json({ success: true, data: { items } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /admin/ads — 광고 1건 등록 (A)
router.post('/', async (req, res) => {
  try {
    const { title, imageUrl, content, linkUrl, shareText } = req.body ?? {};
    await ensureAdsTable();

    const id = crypto.randomUUID();
    const titleVal = title != null ? String(title).trim() : null;
    const imageUrlVal = imageUrl != null ? String(imageUrl).trim() : '';
    const contentVal = content != null ? String(content) : '';
    const linkUrlVal = linkUrl != null ? String(linkUrl).trim() : '';
    const shareTextVal = shareText != null ? String(shareText).trim() : '';

    await prisma.$executeRaw`
      INSERT INTO "ads" ("id","title","imageUrl","content","linkUrl","shareText","updatedAt")
      VALUES (${id}, ${titleVal}, ${imageUrlVal}, ${contentVal}, ${linkUrlVal}, ${shareTextVal}, NOW())
    `;

    res.status(201).json({ success: true, data: { id } });
  } catch (e) {
    console.error('[POST /admin/ads] failed', e);
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /admin/ads/:id — 광고 1건 수정 (A)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureAdsTable();

    const { title, imageUrl, content, linkUrl, shareText } = req.body ?? {};

    const titleVal = title != null ? String(title).trim() : null;
    const imageUrlVal = imageUrl != null ? String(imageUrl).trim() : '';
    const contentVal = content != null ? String(content) : '';
    const linkUrlVal = linkUrl != null ? String(linkUrl).trim() : '';
    const shareTextVal = shareText != null ? String(shareText).trim() : '';

    const updated = await prisma.$queryRaw<
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
      UPDATE "ads"
      SET
        "title" = ${titleVal},
        "imageUrl" = ${imageUrlVal},
        "content" = ${contentVal},
        "linkUrl" = ${linkUrlVal},
        "shareText" = ${shareTextVal},
        "updatedAt" = NOW()
      WHERE "id" = ${id}
      RETURNING
        "id","title","imageUrl","content","linkUrl","shareText","updatedAt"
    `;

    if (!updated[0]) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    res.json({ success: true, data: { id: updated[0].id } });
  } catch (e) {
    console.error('[PUT /admin/ads/:id] failed', e);
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /admin/ads/:id — 광고 1건 삭제 (A)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureAdsTable();
    const deleted = await prisma.$queryRaw<Array<{ id: string }>>`
      DELETE FROM "ads"
      WHERE "id" = ${id}
      RETURNING "id"
    `;
    if (!deleted[0]) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (e) {
    console.error('[DELETE /admin/ads/:id] failed', e);
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /admin/ads — 다건 동기화(B) 또는 레거시 단일(A 폴백)
router.put('/', async (req, res) => {
  try {
    await ensureAdsTable();
    const body = req.body ?? {};

    const items = Array.isArray(body.items) ? body.items : Array.isArray(body.ads) ? body.ads : null;

    // B: { items: [...] } or { ads: [...] }
    if (items) {
      if (items.length === 0) {
        res.status(400).json({ success: false, error: 'items 배열이 비어있습니다.' });
        return;
      }

      await prisma.$executeRaw`DELETE FROM "ads"`;

      for (const w of items) {
        const raw = w as Record<string, unknown>;
        const idVal = raw.id != null ? String(raw.id) : crypto.randomUUID();
        const titleVal = raw.title != null ? String(raw.title).trim() : null;
        const imageUrlVal = raw.imageUrl != null ? String(raw.imageUrl).trim() : '';
        const contentVal = raw.content != null ? String(raw.content) : '';
        const linkUrlVal = raw.linkUrl != null ? String(raw.linkUrl).trim() : '';
        const shareTextVal = raw.shareText != null ? String(raw.shareText).trim() : '';

        await prisma.$executeRaw`
          INSERT INTO "ads" ("id","title","imageUrl","content","linkUrl","shareText","updatedAt")
          VALUES (${idVal}, ${titleVal}, ${imageUrlVal}, ${contentVal}, ${linkUrlVal}, ${shareTextVal}, NOW())
        `;
      }

      res.json({ success: true, data: { items: await getAdsItems() } });
      return;
    }

    // 레거시 단일: PUT /admin/ads
    const { title, imageUrl, content, linkUrl, shareText } = body as Record<string, unknown>;

    const titleVal = title != null ? String(title).trim() : null;
    const imageUrlVal = imageUrl != null ? String(imageUrl).trim() : '';
    const contentVal = content != null ? String(content) : '';
    const linkUrlVal = linkUrl != null ? String(linkUrl).trim() : '';
    const shareTextVal = shareText != null ? String(shareText).trim() : '';

    await prisma.$executeRaw`
      INSERT INTO "ads" ("id","title","imageUrl","content","linkUrl","shareText","updatedAt")
      VALUES (${LEGACY_SINGLE_ID}, ${titleVal}, ${imageUrlVal}, ${contentVal}, ${linkUrlVal}, ${shareTextVal}, NOW())
      ON CONFLICT ("id") DO UPDATE SET
        "title" = ${titleVal},
        "imageUrl" = ${imageUrlVal},
        "content" = ${contentVal},
        "linkUrl" = ${linkUrlVal},
        "shareText" = ${shareTextVal},
        "updatedAt" = NOW()
    `;

    res.json({ success: true, data: { id: LEGACY_SINGLE_ID } });
  } catch (e) {
    console.error('[PUT /admin/ads] failed', e);
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;

