import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

async function ensureCouponDeliveryColumns() {
  // DB 마이그레이션이 아직 적용 전이어도 런타임에서 안전하게 열을 생성
  // (개발/테스트 환경에서 prisma generate/배포 타이밍 불일치 대응)
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

// POST /coupons/register — 쿠폰 등록
router.post('/register', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ success: false, error: 'code 필수' });
      return;
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: String(code).trim().toUpperCase() },
    });

    if (!coupon) {
      res.status(404).json({ success: false, error: '유효하지 않은 쿠폰입니다.' });
      return;
    }

    if (coupon.validUntil && coupon.validUntil < new Date()) {
      res.status(400).json({ success: false, error: '만료된 쿠폰입니다.' });
      return;
    }

    const existing = await prisma.userCoupon.findUnique({
      where: {
        userId_couponId: { userId, couponId: coupon.id },
      },
    });
    if (existing) {
      res.status(409).json({ success: false, error: '이미 사용한 쿠폰입니다.' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.userCoupon.create({
        data: { userId, couponId: coupon.id },
      });
    });

    res.status(201).json({
      success: true,
      data: { amount: coupon.amount, message: `${coupon.amount.toLocaleString()}원 쿠폰이 등록되었습니다.` },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /coupons/:id/redeem — 쿠폰 신청
// FE 흐름: active → pending_delivery →(관리자 발송완료)→ delivered
router.post('/:id/redeem', async (req, res) => {
  try {
    await ensureCouponDeliveryColumns();

    const userId = req.user!.id;
    const userCouponId = String(req.params.id).trim();
    const isMock = userCouponId.startsWith('mock_');
    console.log('[COUPON REDEEM]', { userId, userCouponId, isMock });

    // 테스트용 더미 쿠폰(mock_) 처리:
    // 1) DB에 UserCoupon을 생성/전이
    // 2) 응답에 isMock=true 제공
    if (userCouponId.startsWith('mock_')) {
      const now = new Date();
      const couponCode = userCouponId.toUpperCase(); // mock id 자체를 코드로 사용(충돌 방지)
      console.log('[COUPON REDEEM MOCK]', { couponCode, userId, userCouponId });

      const coupon =
        (await prisma.coupon.findUnique({ where: { code: couponCode } })) ??
        (await prisma.coupon.create({
          data: {
            code: couponCode,
            name: '더미 쿠폰',
            type: 'other',
            imageUrl: null,
            amount: 0,
            validUntil: null,
          },
        }));

      const existing = await prisma.userCoupon.findUnique({ where: { id: userCouponId } });

      const updated =
        existing == null
          ? await prisma.userCoupon.create({
              data: {
                id: userCouponId,
                userId,
                couponId: coupon.id,
                status: 'pending_delivery',
                redeemedAt: now,
              },
            })
          : await prisma.userCoupon.update({
              where: { id: userCouponId },
              data: { status: 'pending_delivery', redeemedAt: now },
            });

      res.json({
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
          redeemedAt: updated.redeemedAt,
          deliveredAt: updated.deliveredAt,
          isMock: true,
        },
      });
      return;
    }

    const row = await prisma.userCoupon.findUnique({
      where: { id: userCouponId },
      include: { coupon: true },
    });

    console.log('[COUPON REDEEM REAL]', { userId, userCouponId, rowStatus: row?.status });

    if (!row || row.userId !== userId) {
      res.status(404).json({ success: false, error: '쿠폰을 찾을 수 없습니다.' });
      return;
    }

    if (row.status !== 'active') {
      res.status(400).json({
        success: false,
        error: `현재 쿠폰 상태는 '${row.status}' 입니다.`,
      });
      return;
    }

    const updated = await prisma.userCoupon.update({
      where: { id: userCouponId },
      data: { status: 'pending_delivery', redeemedAt: new Date() },
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        redeemedAt: updated.redeemedAt,
        deliveredAt: updated.deliveredAt,
        isMock: false,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
