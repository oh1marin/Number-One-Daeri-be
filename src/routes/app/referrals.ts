import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { findUserByPhone, normalizePhone } from '../../lib/phoneUser';
import { issueReferrerTierTickets } from '../../lib/referralTierRewards';

const router = Router();

const REFERRER_REWARD = 2000; // B가 A 전화번호로 추천 등록 시 A에게 2,000원
// 친구(B) 추가 마일리지 없음 — 10,000P는 가입 보너스(추천 무관)

// POST /referrals/register
router.post('/register', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { referrerPhone } = req.body;

    if (!referrerPhone) {
      res.status(400).json({ success: false, error: 'referrerPhone 필수' });
      return;
    }

    const phone = normalizePhone(referrerPhone);
    const referrer = await findUserByPhone(phone);

    if (!referrer || referrer.deletedAt) {
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
      const refAfter = await tx.user.update({
        where: { id: referrer.id },
        data: { mileageBalance: { increment: REFERRER_REWARD } },
      });
      await tx.mileageHistory.create({
        data: {
          userId: referrer.id,
          type: 'earn',
          amount: REFERRER_REWARD,
          balance: refAfter.mileageBalance,
          description: '추천 보상',
        },
      });

      const newCount = await tx.userReferral.count({
        where: { referrerId: referrer.id },
      });
      await issueReferrerTierTickets(tx, referrer.id, newCount);
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

    if (referredCount > 0) {
      await prisma.$transaction(async (tx) => {
        await issueReferrerTierTickets(tx, userId, referredCount);
      });
    }

    // 2명/5명 추천 보너스 — 쿠폰함 티켓
    const tierBonuses = await prisma.referrerTierBonus.findMany({
      where: { referrerId: userId },
      orderBy: { tier: 'asc' },
    });
    const tierCoupons = tierBonuses.map((b) => ({
      tier: b.tier,
      rewardType: b.rewardType,
      name:
        b.rewardType === 'starbucks_2'
          ? '메가MGC커피 아메리카노 쿠폰 2장'
          : '교촌양념 (22,000원)',
      status: b.status,
      earnedAt: b.createdAt,
      couponWallet: b.status === 'claimed',
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
