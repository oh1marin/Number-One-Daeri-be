import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

const REFERRER_REWARD = 2000; // B가 A 코드로 가입 시 A에게 2,000원
// 친구(B)는 10,000원 받지 않음 — 10,000원은 기본 가입 보너스(추천 무관)

// POST /referrals/register
router.post('/register', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { referrerPhone } = req.body;

    if (!referrerPhone) {
      res.status(400).json({ success: false, error: 'referrerPhone 필수' });
      return;
    }

    const phone = String(referrerPhone).trim().replace(/\s|-/g, '');
    const users = await prisma.user.findMany({ where: { phone: { not: null } } });
    const referrer = users.find(
      (u) => u.phone && u.phone.replace(/\s|-/g, '') === phone
    );

    if (!referrer) {
      res.status(404).json({ success: false, error: '추천인을 찾을 수 없습니다.' });
      return;
    }

    if (referrer.id === userId) {
      res.status(400).json({ success: false, error: '본인 전화번호는 등록할 수 없습니다.' });
      return;
    }

    const existing = await prisma.userReferral.findUnique({
      where: { referredId: userId },
    });
    if (existing) {
      res.status(409).json({ success: false, error: '이미 추천인이 등록되어 있습니다.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, error: 'Not found' });

    await prisma.$transaction(async (tx) => {
      await tx.userReferral.create({
        data: {
          referrerId: referrer.id,
          referredId: userId,
          referrerReward: REFERRER_REWARD,
          referredReward: 0,
        },
      });
      await tx.user.update({
        where: { id: referrer.id },
        data: { mileageBalance: { increment: REFERRER_REWARD } },
      });
      await tx.mileageHistory.create({
        data: {
          userId: referrer.id,
          type: 'earn',
          amount: REFERRER_REWARD,
          balance: referrer.mileageBalance + REFERRER_REWARD,
          description: '추천 보상',
        },
      });

      // 2명/5명 추천 시 쿠폰 지급 (마일리지 아님)
      const newCount = (await tx.userReferral.count({ where: { referrerId: referrer.id } }));
      const tierRewards: [number, string][] = [
        [2, 'starbucks_2'],   // 스타벅스 쿠폰 2장
        [5, 'kyochon_set'],   // 교촌치킨 세트
      ];
      for (const [tier, rewardType] of tierRewards) {
        if (newCount >= tier) {
          const existing = await tx.referrerTierBonus.findUnique({
            where: { referrerId_tier: { referrerId: referrer.id, tier } },
          });
          if (!existing) {
            await tx.referrerTierBonus.create({
              data: { referrerId: referrer.id, tier, rewardType },
            });
          }
        }
      }
    });

    res.json({
      success: true,
      data: { success: true, message: '추천인이 등록되었습니다.' },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /referrals/my
router.get('/my', async (req, res) => {
  try {
    const userId = req.user!.id;

    const referral = await prisma.userReferral.findUnique({
      where: { referredId: userId },
      include: { referrer: { select: { phone: true, name: true } } },
    });

    const referredList = await prisma.userReferral.findMany({
      where: { referrerId: userId },
    });
    const referredCount = referredList.length;
    const referrerTotal = referredList.reduce((s, r) => s + r.referrerReward, 0);
    const totalReward = referrerTotal;

    // 2명/5명 추천 보너스 쿠폰 목록
    const tierBonuses = await prisma.referrerTierBonus.findMany({
      where: { referrerId: userId },
      orderBy: { tier: 'asc' },
    });
    const tierCoupons = tierBonuses.map((b) => ({
      tier: b.tier,
      rewardType: b.rewardType,
      name: b.rewardType === 'starbucks_2' ? '스타벅스 쿠폰 2장' : '교촌치킨 세트',
      earnedAt: b.createdAt,
    }));

    res.json({
      success: true,
      data: {
        referrer: referral
          ? { phone: referral.referrer.phone, name: referral.referrer.name }
          : null,
        totalReward,
        referredCount,
        tierCoupons,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
