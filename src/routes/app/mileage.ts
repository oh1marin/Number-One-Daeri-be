import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

// GET /mileage/history — 적립/사용 내역
router.get('/history', async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.mileageHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.mileageHistory.count({ where: { userId } }),
    ]);

    const formatted = items.map((it) => ({
      id: it.id,
      type: it.type,
      amount: it.amount,
      balance: it.balance,
      description: it.description,
      createdAt: it.createdAt,
    }));

    res.json({ success: true, data: { items: formatted, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
