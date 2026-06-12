import type { Prisma } from '@prisma/client';

/** 추천 N명 달성 시 쿠폰함에 넣는 기프티콘 교환 티켓 (원할 때 사용) */
const TIER_TICKETS: Record<
  number,
  { rewardType: string; code: string; name: string; type: string; amount: number }
> = {
  2: {
    rewardType: 'starbucks_2',
    code: 'REFERRAL_TIER2_COFFEE',
    name: '메가MGC커피 아메리카노 쿠폰 2장',
    type: 'starbucks',
    amount: 0,
  },
  5: {
    rewardType: 'kyochon_set',
    code: 'REFERRAL_TIER5_KYOCHON',
    name: '교촌양념',
    type: 'chicken',
    amount: 22000,
  },
};

export async function issueReferrerTierTickets(
  tx: Prisma.TransactionClient,
  referrerId: string,
  referredCount: number,
): Promise<void> {
  for (const [tierStr, meta] of Object.entries(TIER_TICKETS)) {
    const tier = Number(tierStr);
    if (referredCount < tier) continue;

    const existingBonus = await tx.referrerTierBonus.findUnique({
      where: { referrerId_tier: { referrerId, tier } },
    });
    if (existingBonus?.status === 'claimed') continue;

    const coupon = await tx.coupon.upsert({
      where: { code: meta.code },
      create: {
        code: meta.code,
        name: meta.name,
        type: meta.type,
        amount: meta.amount,
      },
      update: {
        name: meta.name,
        type: meta.type,
        amount: meta.amount,
      },
    });

    const existingTicket = await tx.userCoupon.findFirst({
      where: { userId: referrerId, couponId: coupon.id },
    });
    if (!existingTicket) {
      await tx.userCoupon.create({
        data: {
          userId: referrerId,
          couponId: coupon.id,
          status: 'active',
        },
      });
    }

    if (existingBonus) {
      await tx.referrerTierBonus.update({
        where: { id: existingBonus.id },
        data: { status: 'claimed', rewardType: meta.rewardType },
      });
    } else {
      await tx.referrerTierBonus.create({
        data: {
          referrerId,
          tier,
          rewardType: meta.rewardType,
          status: 'claimed',
        },
      });
    }
  }
}
