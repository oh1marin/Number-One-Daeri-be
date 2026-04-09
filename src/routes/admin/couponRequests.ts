import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

async function ensureUserCouponDeliveryColumns() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT \'active\''
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "redeemedAt" TIMESTAMP(3)'
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3)'
  );
  await prisma.$executeRawUnsafe(
    'UPDATE "user_coupons" SET "status" = \'active\' WHERE "status" IS NULL'
  );
}

// GET /admin/coupon-requests?status=pending_delivery
router.get('/', async (req, res) => {
  try {
    await ensureUserCouponDeliveryColumns();

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));
    const statusQuery = String(req.query.status ?? 'pending_delivery').trim();
    const skip = (page - 1) * limit;

    const allowed = ['active', 'pending_delivery', 'delivered'];
    const status = allowed.includes(statusQuery) ? statusQuery : 'pending_delivery';
    const where = { status };

    const [items, total] = await Promise.all([
      prisma.userCoupon.findMany({
        where,
        orderBy: { redeemedAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, phone: true } },
          coupon: {
            select: {
              id: true,
              code: true,
              name: true,
              amount: true,
              type: true,
              imageUrl: true,
              validUntil: true,
            },
          },
        },
      }),
      prisma.userCoupon.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: items.map((uc) => ({
          id: uc.id,
          status: uc.status,
          isMock: String(uc.id).startsWith('mock_'),
          redeemedAt: uc.redeemedAt,
          deliveredAt: uc.deliveredAt,
          receivedAt: uc.createdAt,
          userId: uc.userId,
          user: {
            id: uc.user?.id,
            name: uc.user?.name,
            phone: uc.user?.phone,
          },
          couponId: uc.couponId,
          coupon: {
            id: uc.coupon?.id,
            code: uc.coupon?.code,
            name: uc.coupon?.name ?? uc.coupon?.code,
            amount: uc.coupon?.amount,
            type: uc.coupon?.type,
            imageUrl: uc.coupon?.imageUrl,
            validUntil: uc.coupon?.validUntil,
          },
        })),
        total,
        page,
        limit,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /admin/coupon-requests/:id/complete
router.put('/:id/complete', async (req, res) => {
  try {
    const userCouponId = String(req.params.id).trim();

    await ensureUserCouponDeliveryColumns();

    const row = await prisma.userCoupon.findUnique({
      where: { id: userCouponId },
      include: { user: { select: { id: true, name: true, phone: true } }, coupon: true },
    });

    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    if (row.status !== 'pending_delivery') {
      return res.status(400).json({
        success: false,
        error: `현재 상태는 '${row.status}' 입니다. pending_delivery 상태에서만 완료 처리할 수 있습니다.`,
      });
    }

    const updated = await prisma.userCoupon.update({
      where: { id: userCouponId },
      data: { status: 'delivered', deliveredAt: new Date() },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        coupon: { select: { id: true, code: true, name: true, amount: true, type: true, imageUrl: true, validUntil: true } },
      },
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;

