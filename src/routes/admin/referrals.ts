import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const items = await prisma.userReferral.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        referrer: { select: { id: true, name: true, phone: true, email: true } },
        referred: { select: { id: true, name: true, phone: true, email: true } },
      },
    });
    const byReferrer = items.reduce(
      (acc, r) => {
        const id = r.referrerId;
        if (!acc[id]) acc[id] = { referrer: r.referrer, referredList: [], count: 0 };
        acc[id].referredList.push(r.referred);
        acc[id].count++;
        return acc;
      },
      {} as Record<string, { referrer: typeof items[0]['referrer']; referredList: unknown[]; count: number }>
    );
    res.json({
      success: true,
      data: Object.values(byReferrer).map((v) => ({
        referrer: v.referrer,
        referredCount: v.count,
        referredList: v.referredList,
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.get('/tier-bonuses', async (_req, res) => {
  try {
    const items = await prisma.referrerTierBonus.findMany({
      orderBy: { createdAt: 'desc' },
      include: { referrer: { select: { id: true, name: true, phone: true } } },
    });
    res.json({
      success: true,
      data: items.map((b) => ({
        id: b.id,
        tier: b.tier,
        rewardType: b.rewardType,
        name: b.rewardType === 'starbucks_2' ? '스타벅스 쿠폰 2장' : '교촌치킨 세트',
        referrer: b.referrer,
        earnedAt: b.createdAt,
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
