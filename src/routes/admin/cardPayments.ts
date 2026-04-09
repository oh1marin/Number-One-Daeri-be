import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { cancelPayment, isPortOneConfigured } from '../../lib/portone';

const router = Router();

// GET /admin/card-payments
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const where = { userId: { not: null }, status: 'completed' };

    const [rides, total] = await Promise.all([
      prisma.ride.findMany({
        where,
        include: { user: { select: { id: true, email: true, name: true, phone: true } } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.ride.count({ where }),
    ]);

    const items = rides.map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      total: r.total,
      fare: r.fare,
      date: r.date,
      time: r.time,
      pickup: r.pickup,
      dropoff: r.dropoff,
      completedAt: r.updatedAt,
    }));

    res.json({ success: true, data: { items, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /admin/card-payments/today
router.get('/today', async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rides = await prisma.ride.findMany({
      where: {
        userId: { not: null },
        status: 'completed',
        date: today,
      },
      include: { user: { select: { id: true, email: true, name: true, phone: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    const items = rides.map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      total: r.total,
      fare: r.fare,
      date: r.date,
      time: r.time,
      pickup: r.pickup,
      dropoff: r.dropoff,
      completedAt: r.updatedAt,
    }));

    const totalAmount = rides.reduce((s, r) => s + (r.total || 0), 0);

    res.json({
      success: true,
      data: { items, total: rides.length, totalAmount },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /admin/card-payments/cancel — PortOne 결제 취소(환불)
// Body: { transactionId: string, amount?: number } — amount 미입력 시 전액 취소
// 용도: 100원 인증 결제 수동 환불, 기타 결제 취소
router.post('/cancel', async (req, res) => {
  try {
    if (!isPortOneConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'PortOne API가 설정되지 않았습니다. (PORTONE_API_SECRET, PORTONE_STORE_ID)',
      });
    }

    const { transactionId, amount } = req.body;
    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'transactionId 필수',
      });
    }

    const result = await cancelPayment(
      transactionId.trim(),
      amount != null ? Number(amount) : undefined
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || '결제 취소 실패',
      });
    }

    res.json({
      success: true,
      data: { message: '결제가 취소되었습니다.' },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
