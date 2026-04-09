import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const status = req.query.status as string | undefined;
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { id: true, name: true, email: true, phone: true, mileageBalance: true } } },
      }),
      prisma.withdrawal.count({ where }),
    ]);
    res.json({ success: true, data: { items, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.patch('/:id/approve', async (req, res) => {
  try {
    const w = await prisma.withdrawal.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!w) return res.status(404).json({ success: false, error: 'Not found' });
    if (w.status !== 'pending') return res.status(400).json({ success: false, error: '이미 처리됨' });
    const now = new Date();
    const updated = await prisma.withdrawal.update({
      where: { id: w.id },
      // 고객이 신청할 때 이미 mileageBalance를 차감했으므로,
      // 여기서는 "처리 시작" 상태만 전이한다.
      data: { status: 'processing', processedAt: now },
    });
    // 주의: 고객이 신청할 때 이미 마일리지를 차감하고 history를 기록하도록 변경됨.
    // 여기서는 실제 송금(또는 처리 완료)만 상태 변경한다고 가정한다.
    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.patch('/:id/reject', async (req, res) => {
  try {
    const w = await prisma.withdrawal.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!w) return res.status(404).json({ success: false, error: 'Not found' });
    if (w.status !== 'pending') return res.status(400).json({ success: false, error: '이미 처리됨' });
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id: w.id },
        data: { status: 'rejected', processedAt: now },
      });

      const updatedUser = await tx.user.update({
        where: { id: w.userId },
        data: { mileageBalance: { increment: w.amount } },
        select: { mileageBalance: true },
      });

      await tx.mileageHistory.create({
        data: {
          userId: w.userId,
          type: 'transfer',
          amount: w.amount,
          balance: updatedUser.mileageBalance,
          description: '마일리지 출금 거절(환급)',
        },
      });

      return updatedWithdrawal;
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PATCH /admin/withdrawals/:id/complete — 수동 완료 처리(승인=processing 이후)
router.patch('/:id/complete', async (req, res) => {
  try {
    const w = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
    if (!w) return res.status(404).json({ success: false, error: 'Not found' });
    if (w.status !== 'processing') return res.status(400).json({ success: false, error: 'processing 상태가 아닙니다.' });
    const updated = await prisma.withdrawal.update({
      where: { id: w.id },
      data: { status: 'completed', processedAt: new Date() },
    });
    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
