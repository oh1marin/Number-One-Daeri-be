import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { sendMileageAdjustNotification } from '../../lib/fcm';
import {
  findRideMileageRefund,
  findRideMileageUse,
  refundMileageForRide,
} from '../../services/rideMileagePayment';

const router = Router();

const BULK_MILEAGE_MAX = 300;

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

async function phoneDigitsToUserId(): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, phone: { not: null } },
    select: { id: true, phone: true },
  });
  const map = new Map<string, string>();
  for (const u of users) {
    const d = digitsOnly(u.phone || '');
    if (d.length >= 10) map.set(d, u.id);
  }
  return map;
}

// POST /admin/mileage/adjust — 마일리지 적립/차감 { userId, amount, reason }
router.post('/adjust', async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;
    if (!userId || amount == null || typeof amount !== 'number') {
      res.status(400).json({ success: false, error: 'userId, amount(숫자) 필수' });
      return;
    }
    const amt = Math.round(amount);
    if (amt === 0) {
      res.status(400).json({ success: false, error: 'amount는 0이 아니어야 함' });
      return;
    }
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      res.status(404).json({ success: false, error: '회원을 찾을 수 없습니다.' });
      return;
    }
    const newBalance = user.mileageBalance + amt;
    if (newBalance < 0) {
      res.status(400).json({ success: false, error: '잔액이 음수가 될 수 없습니다.' });
      return;
    }
    const type = amt > 0 ? 'earn' : 'use';
    const desc = (reason && String(reason).trim()) || (amt > 0 ? '관리자 적립' : '관리자 차감');
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { mileageBalance: newBalance },
      }),
      prisma.mileageHistory.create({
        data: {
          userId,
          type,
          amount: Math.abs(amt),
          balance: newBalance,
          description: desc,
        },
      }),
    ]);
    res.json({
      success: true,
      data: { userId, amount: amt, balance: newBalance, description: desc },
    });

    void sendMileageAdjustNotification(userId, amt, newBalance, desc).catch((err) => {
      console.warn('[FCM] mileage adjust 알림 실패:', err);
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /admin/mileage/bulk-adjust — 엑셀 등 일괄 적립/차감 { items: [{ userId?, phone?, amount, reason? }] }
// amount: 양수 적립, 음수 차감. 전화번호는 앱 회원(탈퇴 제외)과 숫자만 일치 시 매칭.
router.post('/bulk-adjust', async (req, res) => {
  try {
    const { items } = req.body as {
      items?: { userId?: string; phone?: string; amount?: unknown; reason?: string }[];
    };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'items는 비어 있지 않은 배열이어야 합니다.' });
      return;
    }
    if (items.length > BULK_MILEAGE_MAX) {
      res.status(400).json({
        success: false,
        error: `한 번에 최대 ${BULK_MILEAGE_MAX}건까지 처리할 수 있습니다.`,
      });
      return;
    }

    const phoneMap = await phoneDigitsToUserId();

    const pushTargets: { userId: string; delta: number; balance: number; desc: string }[] = [];

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < items.length; i++) {
        const row = items[i];
        let uid = typeof row.userId === 'string' ? row.userId.trim() : '';
        if (!uid && row.phone != null) {
          const d = digitsOnly(String(row.phone));
          uid = phoneMap.get(d) ?? '';
        }
        if (!uid) {
          throw new Error(`행 ${i + 1}: userId 또는 등록된 전화번호로 회원을 찾을 수 없습니다.`);
        }
        const amt = Math.round(Number(row.amount));
        if (!Number.isFinite(amt) || amt === 0) {
          throw new Error(`행 ${i + 1}: amount는 0이 아닌 숫자여야 합니다.`);
        }
        const user = await tx.user.findFirst({
          where: { id: uid, deletedAt: null },
        });
        if (!user) {
          throw new Error(`행 ${i + 1}: 회원을 찾을 수 없습니다.`);
        }
        const newBalance = user.mileageBalance + amt;
        if (newBalance < 0) {
          throw new Error(
            `행 ${i + 1}: 잔액이 음수가 됩니다. (현재 ${user.mileageBalance}원, 변동 ${amt}원)`,
          );
        }
        const type = amt > 0 ? 'earn' : 'use';
        const desc =
          (row.reason && String(row.reason).trim()) ||
          (amt > 0 ? '관리자 일괄 적립' : '관리자 일괄 차감');
        await tx.user.update({
          where: { id: uid },
          data: { mileageBalance: newBalance },
        });
        await tx.mileageHistory.create({
          data: {
            userId: uid,
            type,
            amount: Math.abs(amt),
            balance: newBalance,
            description: desc,
          },
        });
        pushTargets.push({ userId: uid, delta: amt, balance: newBalance, desc });
      }
    });

    res.json({ success: true, data: { processed: items.length } });

    for (const p of pushTargets) {
      void sendMileageAdjustNotification(p.userId, p.delta, p.balance, p.desc).catch((err) => {
        console.warn('[FCM] mileage bulk 알림 실패:', p.userId, err);
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/^행 \d+:/.test(msg)) {
      res.status(400).json({ success: false, error: msg });
      return;
    }
    res.status(500).json({ success: false, error: msg });
  }
});

router.get('/history', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const userId = req.query.userId as string | undefined;
    const skip = (page - 1) * limit;
    const where = userId ? { userId } : {};
    const [items, total] = await Promise.all([
      prisma.mileageHistory.findMany({
        where,
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.mileageHistory.count({ where }),
    ]);
    res.json({ success: true, data: { items, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.get('/errors', async (_req, res) => {
  try {
    res.json({ success: true, data: { items: [], total: 0 } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /admin/mileage/ride-payments — 마일리지 결제 콜 내역 (차감/환불 상태)
router.get('/ride-payments', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';

    const where: Record<string, unknown> = {
      paymentMethod: 'mileage',
      userId: { not: null },
    };
    if (status) where.status = status;
    if (phone.length >= 4) {
      const digits = phone.replace(/\D/g, '');
      where.OR = [{ phone: { contains: digits } }, { user: { phone: { contains: digits } } }];
    }

    const [rides, total] = await Promise.all([
      prisma.ride.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, phone: true, mileageBalance: true } },
        },
      }),
      prisma.ride.count({ where }),
    ]);

    const items = await Promise.all(
      rides.map(async (r) => {
        const userId = r.userId!;
        const [useRow, refundRow] = await Promise.all([
          findRideMileageUse(prisma, userId, r.id),
          findRideMileageRefund(prisma, userId, r.id),
        ]);
        const amount =
          r.total > 0 ? r.total : r.estimatedFare ?? (useRow ? Math.abs(useRow.amount) : 0);

        return {
          rideId: r.id,
          status: r.status,
          pickup: r.pickup,
          dropoff: r.dropoff,
          amount,
          createdAt: r.createdAt,
          user: r.user,
          mileage: {
            deducted: Boolean(useRow),
            deductedAmount: useRow ? Math.abs(useRow.amount) : 0,
            deductedAt: useRow?.createdAt ?? null,
            balanceAfterDeduct: useRow?.balance ?? null,
            refunded: Boolean(refundRow),
            refundedAmount: refundRow?.amount ?? 0,
            refundedAt: refundRow?.createdAt ?? null,
            canRefund: Boolean(useRow) && !refundRow,
          },
        };
      })
    );

    res.json({ success: true, data: { items, total, page, limit } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /admin/mileage/ride-payments/:rideId/refund — 마일리지 결제 환불
router.post('/ride-payments/:rideId/refund', async (req, res) => {
  try {
    const rideId = req.params.rideId;
    const reason =
      req.body?.reason != null ? String(req.body.reason).trim() : '관리자 환불';

    const ride = await prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) {
      return res.status(404).json({ success: false, error: '콜을 찾을 수 없습니다.' });
    }
    if (ride.paymentMethod !== 'mileage' || !ride.userId) {
      return res.status(400).json({
        success: false,
        error: '마일리지 결제 앱 콜만 환불할 수 있습니다.',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const refund = await refundMileageForRide(tx, {
        userId: ride.userId!,
        rideId,
        reason,
      });

      const cancelRide = req.body?.cancelRide === true && ride.status !== 'completed';
      if (cancelRide) {
        await tx.ride.update({
          where: { id: rideId },
          data: { status: 'cancelled' },
        });
      }

      const user = await tx.user.findUnique({
        where: { id: ride.userId! },
        select: { id: true, name: true, phone: true, mileageBalance: true },
      });

      return { refund, user, cancelled: cancelRide };
    });

    res.json({
      success: true,
      data: {
        rideId,
        refunded: result.refund.refunded,
        alreadyRefunded: result.refund.alreadyRefunded,
        amount: result.refund.amount,
        user: result.user,
        rideCancelled: result.cancelled,
      },
      message: result.refund.alreadyRefunded
        ? '이미 환불된 콜입니다.'
        : `${result.refund.amount.toLocaleString()}원 마일리지를 환불했습니다.`,
    });

    if (result.refund.refunded && result.user) {
      void sendMileageAdjustNotification(
        ride.userId!,
        result.refund.amount,
        result.user.mileageBalance,
        reason
      ).catch((err) => console.warn('[FCM] mileage refund 알림 실패:', err));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'NO_MILEAGE_DEDUCTION') {
      return res.status(400).json({
        success: false,
        error: '차감 내역이 없어 환불할 수 없습니다.',
        code: 'NO_DEDUCTION',
      });
    }
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
