import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

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
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
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

export default router;
