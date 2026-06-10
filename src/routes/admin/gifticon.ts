import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { jsonError } from '../../lib/jsonError';
import {
  giftishowCatalogGoods,
  giftishowGetGoodsDetail,
  giftishowListBrands,
  isGiftishowEnabled,
  type GifticonProductDto,
} from '../../lib/giftishow';

const router = Router();

function catalogItemDto(row: GifticonProductDto, alreadyRegistered: boolean) {
  return {
    id: row.goodsCode,
    goodsCode: row.goodsCode,
    name: row.name,
    brandName: row.brandName,
    brandCode: row.brandCode,
    price: row.price,
    mileagePrice: row.price,
    imageUrl: row.imageUrl ?? undefined,
    category: row.category,
    available: row.available,
    alreadyRegistered,
  };
}

async function registeredGoodsCodes(codes: string[]): Promise<Set<string>> {
  if (!codes.length) return new Set();
  const rows = await prisma.coupon.findMany({
    where: { giftishowGoodsCode: { in: codes } },
    select: { giftishowGoodsCode: true },
  });
  return new Set(
    rows.map((r) => String(r.giftishowGoodsCode ?? '').trim().toUpperCase()).filter(Boolean)
  );
}

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

// GET /admin/gifticon/catalog/brands — 기프티쇼 브랜드 목록
router.get('/catalog/brands', async (req, res) => {
  try {
    if (!isGiftishowEnabled()) {
      jsonError(res, 503, '기프티쇼 API가 설정되지 않았습니다.', { code: 'GIFTISHOW_NOT_CONFIGURED' });
      return;
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(200, Math.max(1, Number(req.query.size) || 200));
    const { list, listNum } = await giftishowListBrands(page, size);
    res.json({
      success: true,
      data: { items: list, total: listNum ?? list.length, page, size },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    jsonError(res, 502, msg || '브랜드 목록 조회 실패');
  }
});

// GET /admin/gifticon/catalog/goods — 기프티쇼 상품 (페이지·검색·브랜드 필터)
router.get('/catalog/goods', async (req, res) => {
  try {
    if (!isGiftishowEnabled()) {
      jsonError(res, 503, '기프티쇼 API가 설정되지 않았습니다.', { code: 'GIFTISHOW_NOT_CONFIGURED' });
      return;
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(50, Math.max(1, Number(req.query.size) || 20));
    const q = String(req.query.q ?? '').trim();
    const brandCode = String(req.query.brandCode ?? req.query.brand ?? '').trim();

    const isGoodsCode = /^G\d{5,}$/i.test(q);
    if (q && q.length < 2 && !isGoodsCode) {
      jsonError(res, 400, '검색어는 2글자 이상 입력해 주세요.', { code: 'SEARCH_TOO_SHORT' });
      return;
    }

    const result = await giftishowCatalogGoods({ page, size, q, brandCode });
    const codes = result.items.map((i) => i.goodsCode);
    const registered = await registeredGoodsCodes(codes);

    res.json({
      success: true,
      data: {
        items: result.items.map((i) =>
          catalogItemDto(i, registered.has(i.goodsCode.toUpperCase()))
        ),
        page,
        size,
        total: result.total,
        hasMore: result.hasMore,
        mode: result.mode,
        fromCache: result.fromCache,
        hint:
          result.mode === 'code'
            ? '상품 코드로 즉시 조회했습니다.'
            : result.mode === 'search'
              ? result.fromCache
                ? `전체 카탈로그에서 검색 (캐시, ${result.total ?? 0}건)`
                : '목록을 준비했습니다. 같은 세션에서 다시 검색하면 더 빠릅니다.'
              : undefined,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    jsonError(res, 502, msg || '상품 목록 조회 실패');
  }
});

// GET /admin/gifticon/catalog/goods/:goodsCode — 기프티쇼 상품 상세
router.get('/catalog/goods/:goodsCode', async (req, res) => {
  try {
    if (!isGiftishowEnabled()) {
      jsonError(res, 503, '기프티쇼 API가 설정되지 않았습니다.', { code: 'GIFTISHOW_NOT_CONFIGURED' });
      return;
    }
    const goodsCode = normalizeGoodsCode(req.params.goodsCode);
    if (!goodsCode) {
      jsonError(res, 400, 'goodsCode 필수');
      return;
    }

    const product = await giftishowGetGoodsDetail(goodsCode);
    if (!product) {
      jsonError(res, 404, '기프티쇼에서 상품을 찾을 수 없습니다.');
      return;
    }

    const registered = await registeredGoodsCodes([goodsCode]);
    res.json({
      success: true,
      data: catalogItemDto(product, registered.has(goodsCode)),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    jsonError(res, 502, msg || '상품 상세 조회 실패');
  }
});

// POST /admin/gifticon/products/import — 기프티쇼 상품코드로 자동 등록
router.post('/products/import', async (req, res) => {
  try {
    if (!isGiftishowEnabled()) {
      jsonError(res, 503, '기프티쇼 API가 설정되지 않았습니다.', { code: 'GIFTISHOW_NOT_CONFIGURED' });
      return;
    }

    const goodsCode = normalizeGoodsCode(req.body?.id ?? req.body?.goodsCode);
    if (!goodsCode) {
      jsonError(res, 400, 'goodsCode 필수');
      return;
    }

    const product = await giftishowGetGoodsDetail(goodsCode);
    if (!product) {
      jsonError(res, 404, '기프티쇼에서 상품을 찾을 수 없습니다.');
      return;
    }
    if (!product.available) {
      jsonError(res, 400, '판매 중이 아닌 상품은 등록할 수 없습니다.');
      return;
    }

    const mileageOverride = normalizePrice(
      req.body?.mileagePrice ?? req.body?.price ?? req.body?.amount
    );
    const mileagePrice = mileageOverride > 0 ? mileageOverride : product.price;
    if (!mileagePrice) {
      jsonError(res, 400, '마일리지 가격을 확인할 수 없습니다.');
      return;
    }

    const name =
      normalizeName(req.body?.name) ??
      (product.brandName ? `${product.brandName} ${product.name}` : product.name);
    const imageUrl =
      normalizeImageUrl(req.body?.imageUrl) ?? normalizeImageUrl(product.imageUrl);

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
        name: name ?? undefined,
        imageUrl,
        amount: mileagePrice,
        giftishowGoodsCode: goodsCode,
      },
      select: { giftishowGoodsCode: true, name: true, amount: true, imageUrl: true },
    });

    res.status(201).json({ success: true, data: dto(upserted) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    jsonError(res, 502, msg || '상품 등록 실패');
  }
});

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

