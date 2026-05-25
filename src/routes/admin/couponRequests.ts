import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import {
  buildGiftishowTrId,
  defaultGiftishowMms,
  giftishowSend,
  giftishowVerifySendSuccess,
  isGiftishowEnabled,
  resolveGiftishowGoodsCode,
  getBizUserId,
  getCallbackNo,
} from '../../lib/giftishow';

const router = Router();

// GET /admin/coupon-requests?status=pending_delivery
router.get('/', async (req, res) => {
  try {
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
              giftishowGoodsCode: true,
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
          giftishowTrId: uc.giftishowTrId,
          deliveryError: uc.deliveryError,
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
            giftishowGoodsCode: uc.coupon?.giftishowGoodsCode,
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

// PUT /admin/coupon-requests/:id/complete — 기프티쇼 send 후 delivered
// Body(옵션): { mmsTitle?, mmsMsg? }
router.put('/:id/complete', async (req, res) => {
  try {
    const userCouponId = String(req.params.id).trim();
    const isMock = userCouponId.startsWith('mock_');

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

    // mock_: 기프티쇼 없이 상태만 전환 (개발용)
    if (isMock || !isGiftishowEnabled()) {
      const updated = await prisma.userCoupon.update({
        where: { id: userCouponId },
        data: { status: 'delivered', deliveredAt: new Date(), deliveryError: null },
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
              giftishowGoodsCode: true,
            },
          },
        },
      });
      res.json({
        success: true,
        data: updated,
        meta: { giftishow: false, reason: isMock ? 'mock' : 'not_configured' },
      });
      return;
    }

    const phone = row.user?.phone?.replace(/\D/g, '') ?? '';
    if (phone.length < 10) {
      res.status(400).json({ success: false, error: '수신자 전화번호가 없습니다.' });
      return;
    }

    const goodsCode = resolveGiftishowGoodsCode(row.coupon);
    if (!goodsCode) {
      res.status(400).json({
        success: false,
        error: '쿠폰에 giftishowGoodsCode(기프티쇼 상품코드)가 설정되지 않았습니다.',
      });
      return;
    }

    const trId = row.giftishowTrId ?? buildGiftishowTrId(userCouponId);
    const couponLabel = row.coupon.name ?? row.coupon.code;
    const defaults = defaultGiftishowMms(couponLabel, row.coupon.amount);
    const mmsTitle =
      typeof req.body?.mmsTitle === 'string' && req.body.mmsTitle.trim()
        ? req.body.mmsTitle.trim()
        : defaults.title;
    const mmsMsg =
      typeof req.body?.mmsMsg === 'string' && req.body.mmsMsg.trim()
        ? req.body.mmsMsg.trim()
        : defaults.msg;

    try {
      await giftishowSend({
        goodsCode,
        phoneNo: phone,
        trId,
        userId: getBizUserId(),
        mmsTitle,
        mmsMsg,
        callbackNo: getCallbackNo(),
        orderNo: userCouponId,
      });

      const verified = await giftishowVerifySendSuccess(trId);

      const updated = await prisma.userCoupon.update({
        where: { id: userCouponId },
        data: {
          status: 'delivered',
          deliveredAt: new Date(),
          giftishowTrId: trId,
          giftishowSendBasicCd: verified?.sendBasicCd ?? null,
          deliveryError: null,
        },
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
              giftishowGoodsCode: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: updated,
        meta: {
          giftishow: true,
          trId,
          sendStatus: verified?.sendStatusCd,
          sendRstCd: verified?.sendRstCd,
        },
      });
    } catch (sendErr) {
      const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      await prisma.userCoupon.update({
        where: { id: userCouponId },
        data: { giftishowTrId: trId, deliveryError: errMsg },
      });
      res.status(502).json({ success: false, error: errMsg, data: { trId } });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
