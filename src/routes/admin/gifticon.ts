import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

function normalizeGoodsCode(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normalizeImageUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  return s ? s : null;
}

function normalizeName(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  return s ? s : null;
}

function normalizePrice(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function dto(row: { giftishowGoodsCode: string | null; name: string | null; amount: number; imageUrl: string | null }) {
  const id = String(row.giftishowGoodsCode ?? '').trim();
  const mileagePrice = Number.isFinite(row.amount) ? Math.round(row.amount) : 0;
  return {
    id,
    name: row.name ?? id,
    mileagePrice,
    imageUrl: row.imageUrl ?? undefined,
  };
}

// GET /admin/gifticon/products — 관리자가 앱에 보여줄 기프티콘 상품(쿠폰 카탈로그) 관리용 목록
router.get('/products', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const items = await prisma.coupon.findMany({
      where: {
        giftishowGoodsCode: { not: null },
        ...(q
          ? {
              OR: [
                { giftishowGoodsCode: { contains: q, mode: 'insensitive' as const } },
                { name: { contains: q, mode: 'insensitive' as const } },
                { code: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { amount: 'asc' },
      take: 500,
      select: { giftishowGoodsCode: true, name: true, amount: true, imageUrl: true },
    });
    res.json({ success: true, data: items.map(dto) });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /admin/gifticon/products — body: { id(goodsCode), name, mileagePrice, imageUrl? }
router.post('/products', async (req, res) => {
  try {
    const goodsCode = normalizeGoodsCode(req.body?.id ?? req.body?.goodsCode);
    const name = normalizeName(req.body?.name);
    const mileagePrice = normalizePrice(req.body?.mileagePrice ?? req.body?.price ?? req.body?.amount);
    const imageUrl = normalizeImageUrl(req.body?.imageUrl ?? req.body?.coverImageUrl ?? req.body?.thumbnailUrl);

    if (!goodsCode) {
      res.status(400).json({ success: false, error: 'id(goodsCode) 필수' });
      return;
    }
    if (!mileagePrice) {
      res.status(400).json({ success: false, error: 'mileagePrice 필수 (1 이상)' });
      return;
    }

    // Coupon.code 는 unique라 충돌 방지를 위해 접두를 둠
    const code = `GIFTICON_${goodsCode}`;

    const upserted = await prisma.coupon.upsert({
      where: { code },
      create: {
        code,
        name: name ?? goodsCode,
        type: 'giftcard',
        imageUrl,
        amount: mileagePrice,
        giftishowGoodsCode: goodsCode,
        validUntil: null,
      },
      update: {
        ...(name !== null && { name }),
        ...(imageUrl !== null && { imageUrl }),
        amount: mileagePrice,
        giftishowGoodsCode: goodsCode,
      },
      select: { giftishowGoodsCode: true, name: true, amount: true, imageUrl: true },
    });

    res.status(201).json({ success: true, data: dto(upserted) });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PATCH /admin/gifticon/products/:id — body: { name?, mileagePrice?, imageUrl? }
router.patch('/products/:id', async (req, res) => {
  try {
    const goodsCode = normalizeGoodsCode(req.params.id);
    if (!goodsCode) {
      res.status(400).json({ success: false, error: 'id(goodsCode) 필수' });
      return;
    }

    const patch: {
      name?: string | null;
      amount?: number;
      imageUrl?: string | null;
    } = {};

    if (req.body?.name !== undefined) patch.name = normalizeName(req.body?.name);
    if (req.body?.imageUrl !== undefined) patch.imageUrl = normalizeImageUrl(req.body?.imageUrl);
    if (req.body?.mileagePrice !== undefined) {
      const n = normalizePrice(req.body?.mileagePrice);
      if (!n) {
        res.status(400).json({ success: false, error: 'mileagePrice는 1 이상 숫자여야 합니다.' });
        return;
      }
      patch.amount = n;
    }

    const code = `GIFTICON_${goodsCode}`;
    const updated = await prisma.coupon.update({
      where: { code },
      data: patch,
      select: { giftishowGoodsCode: true, name: true, amount: true, imageUrl: true },
    });

    res.json({ success: true, data: dto(updated) });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /admin/gifticon/products/:id
router.delete('/products/:id', async (req, res) => {
  try {
    const goodsCode = normalizeGoodsCode(req.params.id);
    if (!goodsCode) {
      res.status(400).json({ success: false, error: 'id(goodsCode) 필수' });
      return;
    }
    const code = `GIFTICON_${goodsCode}`;
    await prisma.coupon.delete({ where: { code } });
    res.json({ success: true, data: null });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;

