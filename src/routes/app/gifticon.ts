import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { inferCouponType } from '../../lib/couponDisplay';
import { gifticonSpendable } from '../../lib/mileageBuckets';
import {
  buildGifticonOrderTrId,
  defaultGiftishowMms,
  formatGiftishowUserError,
  giftishowFindProduct,
  giftishowSend,
  giftishowVerifySendSuccess,
  isGiftishowEnabled,
  type GifticonProductDto,
  getBizUserId,
  getCallbackNo,
} from '../../lib/giftishow';

const router = Router();

function resolveGoodsCode(body: Record<string, unknown>): string {
  const raw =
    body.goodsCode ?? body.productId ?? body.id ?? body.goods_code ?? body.product_id;
  return String(raw ?? '').trim().toUpperCase();
}

function resolveGoodsCodeFromCoupon(row: {
  code: string;
  giftishowGoodsCode: string | null;
}): string {
  const fromGs = String(row.giftishowGoodsCode ?? '').trim();
  if (fromGs) return fromGs.toUpperCase();
  const code = String(row.code ?? '').trim();
  if (code.toUpperCase().startsWith('GIFTICON_')) {
    return code.slice('GIFTICON_'.length).trim().toUpperCase();
  }
  return '';
}

/** 관리자 등록 기프티콘 상품 — 기프티쇼 API 연동 여부와 무관 */
async function listProductsFromDb(): Promise<GifticonProductDto[]> {
  const coupons = await prisma.coupon.findMany({
    where: {
      AND: [
        {
          OR: [
            { giftishowGoodsCode: { not: null } },
            { code: { startsWith: 'GIFTICON_', mode: 'insensitive' } },
          ],
        },
        { OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] },
      ],
    },
    orderBy: { amount: 'asc' },
    take: 200,
  });

  const products: GifticonProductDto[] = [];
  for (const c of coupons) {
    const goodsCode = resolveGoodsCodeFromCoupon(c);
    if (!goodsCode) continue;
    products.push({
      id: goodsCode,
      goodsCode,
      name: c.name ?? goodsCode,
      brandName: '',
      price: c.amount,
      imageUrl: c.imageUrl,
      category: inferCouponType(c.code, c.name, c.type),
      available: c.amount > 0,
    });
  }
  return products;
}

function asInt(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function asStr(v: unknown): string {
  return String(v ?? '').trim();
}

function formatOrder(row: {
  id: string;
  goodsCode: string;
  goodsName: string;
  brandName: string | null;
  imageUrl: string | null;
  price: number;
  status: string;
  giftishowTrId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
}) {
  const price = asInt(row.price);
  const imageUrl = row.imageUrl?.trim() || null;
  return {
    id: asStr(row.id),
    orderId: asStr(row.id),
    goodsCode: asStr(row.goodsCode),
    productId: asStr(row.goodsCode),
    name: asStr(row.goodsName),
    brandName: asStr(row.brandName),
    imageUrl,
    price,
    mileagePrice: price,
    status: asStr(row.status),
    giftishowTrId: row.giftishowTrId ? asStr(row.giftishowTrId) : null,
    errorMessage: row.errorMessage
      ? asStr(formatGiftishowUserError(row.errorMessage).message)
      : null,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
  };
}

function toAppProductItem(p: GifticonProductDto) {
  const goodsCode = asStr(p.goodsCode);
  const price = asInt(p.price);
  const imageUrl = p.imageUrl?.trim() || null;
  return {
    id: goodsCode,
    productId: goodsCode,
    goodsCode,
    name: asStr(p.name) || goodsCode,
    brandName: asStr(p.brandName),
    category: asStr(p.category) || 'other',
    price,
    mileagePrice: price,
    pointPrice: price,
    imageUrl,
    coverImageUrl: imageUrl,
    thumbnailUrl: imageUrl,
    available: Boolean(p.available),
  };
}

// GET /gifticon/products — 앱 상점: 관리자 DB 등록 상품만 (기프티쇼 API 미사용)
router.get('/products', async (req, res) => {
  try {
    const start = Math.max(1, Number(req.query.start ?? req.query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(req.query.size ?? req.query.limit) || 50));

    const catalog = await listProductsFromDb();
    const skip = (start - 1) * size;
    const items = catalog.slice(skip, skip + size).map(toAppProductItem);
    res.json({
      success: true,
      data: { items, total: catalog.length, start, size, source: 'db' },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /gifticon/exchange — 마일리지 차감 + 기프티쇼 MMS 발송
router.post('/exchange', async (req, res) => {
  try {
    if (!isGiftishowEnabled()) {
      res.status(503).json({
        success: false,
        error: '기프티콘 교환 서비스가 설정되지 않았습니다.',
      });
      return;
    }

    const userId = req.user!.id;
    const goodsCode = resolveGoodsCode((req.body ?? {}) as Record<string, unknown>);
    if (!goodsCode) {
      res.status(400).json({ success: false, error: 'goodsCode 또는 productId 필수' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        mileageBalance: true,
        signupBonusRemaining: true,
        name: true,
      },
    });
    if (!user) {
      res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
      return;
    }

    const phone = user.phone?.replace(/\D/g, '') ?? '';
    if (phone.length < 10) {
      res.status(400).json({ success: false, error: '기프티콘 수신을 위해 전화번호 등록이 필요합니다.' });
      return;
    }

    let product: GifticonProductDto | null = null;
    try {
      product = await giftishowFindProduct(goodsCode);
    } catch (e) {
      console.warn('[gifticon/exchange] Giftishow 상품 조회 실패:', e);
    }

    if (!product) {
      const fromDb = (await listProductsFromDb()).find(
        (p) => p.goodsCode.toUpperCase() === goodsCode
      );
      if (fromDb) product = fromDb;
    }

    if (!product || !product.available) {
      res.status(404).json({ success: false, error: '교환 가능한 상품을 찾을 수 없습니다.' });
      return;
    }

    if (product.price <= 0) {
      res.status(400).json({ success: false, error: '상품 가격 정보가 올바르지 않습니다.' });
      return;
    }

    const spendable = gifticonSpendable(
      user.mileageBalance,
      user.signupBonusRemaining ?? 0,
    );
    if (spendable < product.price) {
      if (user.mileageBalance >= product.price) {
        res.status(400).json({
          success: false,
          error:
            '가입 보너스 마일리지는 기프티콘 교환에 사용할 수 없습니다. 대리운전 이용 후 적립된 마일리지로 교환해 주세요.',
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: `마일리지가 부족합니다. (필요: ${product.price.toLocaleString()}원, 교환 가능: ${spendable.toLocaleString()}원)`,
      });
      return;
    }

    const order = await prisma.gifticonOrder.create({
      data: {
        userId,
        goodsCode: product.goodsCode,
        goodsName: product.name,
        brandName: product.brandName || null,
        imageUrl: product.imageUrl,
        price: product.price,
        status: 'pending',
      },
    });

    const trId = buildGifticonOrderTrId(order.id);
    const mms = defaultGiftishowMms(product.name, product.price);

    try {
      await giftishowSend({
        goodsCode: product.goodsCode,
        phoneNo: phone,
        trId,
        userId: getBizUserId(),
        mmsTitle: mms.title,
        mmsMsg: mms.msg,
        callbackNo: getCallbackNo(),
        orderNo: order.id,
      });

      const verified = await giftishowVerifySendSuccess(trId);

      const completed = await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: { mileageBalance: { decrement: product!.price } },
          select: { mileageBalance: true },
        });

        await tx.mileageHistory.create({
          data: {
            userId,
            type: 'spend',
            amount: -product!.price,
            balance: updatedUser.mileageBalance,
            description: `기프티콘 교환: ${product!.name}`,
          },
        });

        return tx.gifticonOrder.update({
          where: { id: order.id },
          data: {
            status: 'completed',
            giftishowTrId: trId,
            giftishowSendBasicCd: verified?.sendBasicCd ?? null,
            deliveredAt: new Date(),
            errorMessage: null,
          },
        });
      });

      res.status(201).json({
        success: true,
        data: {
          ...formatOrder(completed),
          message: '기프티콘이 발송되었습니다.',
          mileageBalance: asInt(
            (
              await prisma.user.findUnique({
                where: { id: userId },
                select: { mileageBalance: true },
              })
            )?.mileageBalance
          ),
        },
      });
    } catch (sendErr) {
      const raw = sendErr instanceof Error ? sendErr.message : String(sendErr);
      const formatted = formatGiftishowUserError(raw);
      console.warn('[gifticon/exchange] send failed:', {
        orderId: order.id,
        goodsCode: product.goodsCode,
        code: formatted.code,
        detail: formatted.detail,
      });
      await prisma.gifticonOrder.update({
        where: { id: order.id },
        data: { status: 'failed', giftishowTrId: trId, errorMessage: formatted.message },
      });
      res.status(502).json({
        success: false,
        error: formatted.message,
        errorCode: formatted.code,
        data: { orderId: order.id, trId },
      });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /gifticon/orders — 내 교환 내역
router.get('/orders', async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? req.query.size) || 20));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.gifticonOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.gifticonOrder.count({ where: { userId } }),
    ]);

    res.json({
      success: true,
      data: {
        items: rows.map(formatOrder),
        total,
        page,
        limit,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
