import type { Prisma } from '@prisma/client';

async function getAccumulationSettings(tx: Prisma.TransactionClient) {
  let s = await tx.accumulationSettings.findFirst();
  if (!s) {
    s = await tx.accumulationSettings.create({
      data: {
        rideEarnRate: 0.1,
        referrerRideRate: 0.05,
        referrerFirstRide: 3000,
      },
    });
  }
  return s;
}

/**
 * 운행 완료 시: (1) 마일리지 결제면 요금 차감 (2) 이용금액의 rideEarnRate% 유저 적립 (3) 추천인 보상
 * 동일 ride.id에 대한 유저 적립/추천인 적립은 description으로 idempotent 처리.
 */
export async function applyRideCompletionMileage(
  tx: Prisma.TransactionClient,
  ride: { id: string; userId: string | null; paymentMethod?: string | null },
  fareNum: number
): Promise<void> {
  if (!ride.userId || fareNum <= 0) return;

  const user = await tx.user.findUnique({ where: { id: ride.userId } });
  if (!user) return;

  const paymentMethod = ride.paymentMethod ?? 'cash';
  const acc = await getAccumulationSettings(tx);

  // 마일리지 결제: 요금 차감 (1회성 — 기존 description 패턴 유지)
  if (paymentMethod === 'mileage') {
    const dupUse = await tx.mileageHistory.findFirst({
      where: {
        userId: ride.userId,
        type: 'use',
        description: { contains: `콜 ${ride.id}` },
      },
    });
    if (!dupUse) {
      const newBalance = user.mileageBalance - fareNum;
      await tx.user.update({
        where: { id: ride.userId },
        data: { mileageBalance: newBalance },
      });
      await tx.mileageHistory.create({
        data: {
          userId: ride.userId,
          type: 'use',
          amount: -fareNum,
          balance: newBalance,
          description: `대리운전 결제 (콜 ${ride.id})`,
        },
      });
    }
  }

  const rideEarnRate = acc.rideEarnRate ?? 0.1;
  const userEarnAmount = Math.floor(fareNum * rideEarnRate);
  const userEarnDesc = `대리운전 이용 적립 (${Math.round(rideEarnRate * 100)}%) · ride:${ride.id}`;

  const dupUserEarn = await tx.mileageHistory.findFirst({
    where: { userId: ride.userId, type: 'earn', description: userEarnDesc },
  });

  if (!dupUserEarn && userEarnAmount > 0) {
    const u = await tx.user.findUnique({ where: { id: ride.userId } });
    const userNewBalance = (u?.mileageBalance ?? 0) + userEarnAmount;
    await tx.user.update({
      where: { id: ride.userId },
      data: { mileageBalance: userNewBalance },
    });
    await tx.mileageHistory.create({
      data: {
        userId: ride.userId,
        type: 'earn',
        amount: userEarnAmount,
        balance: userNewBalance,
        description: userEarnDesc,
      },
    });
  }

  const referral = await tx.userReferral.findUnique({
    where: { referredId: ride.userId },
    include: { referrer: true },
  });
  if (!referral?.referrer) return;

  const completedCount = await tx.ride.count({
    where: { userId: ride.userId, status: 'completed' },
  });
  const isFirstRide = completedCount <= 1;

  const refRate = acc.referrerRideRate ?? 0.05;
  const refFirstBonus = acc.referrerFirstRide ?? 3000;
  let referrerEarn = Math.floor(fareNum * refRate);
  if (isFirstRide) referrerEarn += refFirstBonus;

  const refDesc = isFirstRide
    ? `친구 첫 이용 보너스 + ${Math.round(refRate * 100)}% 적립 · ride:${ride.id}`
    : `친구 이용 ${Math.round(refRate * 100)}% 적립 · ride:${ride.id}`;

  const dupRef = await tx.mileageHistory.findFirst({
    where: { userId: referral.referrerId, type: 'earn', description: refDesc },
  });

  if (dupRef || referrerEarn <= 0) return;

  const refUser = await tx.user.findUnique({ where: { id: referral.referrerId } });
  if (!refUser) return;

  const refNewBalance = refUser.mileageBalance + referrerEarn;
  await tx.user.update({
    where: { id: referral.referrerId },
    data: { mileageBalance: refNewBalance },
  });
  await tx.mileageHistory.create({
    data: {
      userId: referral.referrerId,
      type: 'earn',
      amount: referrerEarn,
      balance: refNewBalance,
      description: refDesc,
    },
  });
}

/** 완료 요금 산정: 바디 → DB total/fare → 예정요금 순 */
export function resolveCompletionFareAmount(
  ride: { total?: number | null; fare?: number | null; estimatedFare?: number | null },
  body: { total?: unknown; fare?: unknown }
): number {
  const fromBodyTotal = body.total != null ? Number(body.total) : NaN;
  const fromBodyFare = body.fare != null ? Number(body.fare) : NaN;
  const n = Number.isFinite(fromBodyTotal) && fromBodyTotal > 0
    ? fromBodyTotal
    : Number.isFinite(fromBodyFare) && fromBodyFare > 0
      ? fromBodyFare
      : Number(ride.total ?? 0) > 0
        ? Number(ride.total)
        : Number(ride.fare ?? 0) > 0
          ? Number(ride.fare)
          : Number(ride.estimatedFare ?? 0) || 0;
  return Math.max(0, Math.floor(n));
}
