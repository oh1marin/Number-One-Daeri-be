import type { Prisma } from '@prisma/client';
import { nextSignupBonusAfterRideSpend } from '../lib/mileageBuckets';

export function mileageRideUseDescription(rideId: string): string {
  return `대리운전 결제 (콜 ${rideId})`;
}

export function mileageRideRefundDescription(rideId: string): string {
  return `마일리지 결제 환불 (콜 ${rideId})`;
}

export async function findRideMileageUse(
  tx: Prisma.TransactionClient,
  userId: string,
  rideId: string
) {
  return tx.mileageHistory.findFirst({
    where: {
      userId,
      type: 'use',
      description: mileageRideUseDescription(rideId),
    },
  });
}

export async function findRideMileageRefund(
  tx: Prisma.TransactionClient,
  userId: string,
  rideId: string
) {
  return tx.mileageHistory.findFirst({
    where: {
      userId,
      type: 'earn',
      description: mileageRideRefundDescription(rideId),
    },
  });
}

/** 앱 콜 접수 시 마일리지 즉시 차감 (멱등) */
export async function deductMileageForRideCall(
  tx: Prisma.TransactionClient,
  params: { userId: string; rideId: string; amount: number }
): Promise<{ deducted: boolean; alreadyDeducted: boolean }> {
  const amount = Math.max(0, Math.floor(params.amount));
  if (amount <= 0) return { deducted: false, alreadyDeducted: false };

  const existing = await findRideMileageUse(tx, params.userId, params.rideId);
  if (existing) return { deducted: false, alreadyDeducted: true };

  const user = await tx.user.findUnique({ where: { id: params.userId } });
  if (!user) throw new Error('USER_NOT_FOUND');
  if (user.mileageBalance < amount) throw new Error('INSUFFICIENT_MILEAGE');

  const newBalance = user.mileageBalance - amount;
  const newSignupRemaining = nextSignupBonusAfterRideSpend(
    user.signupBonusRemaining ?? 0,
    amount
  );

  await tx.user.update({
    where: { id: params.userId },
    data: {
      mileageBalance: newBalance,
      signupBonusRemaining: newSignupRemaining,
    },
  });

  await tx.mileageHistory.create({
    data: {
      userId: params.userId,
      type: 'use',
      amount: -amount,
      balance: newBalance,
      description: mileageRideUseDescription(params.rideId),
    },
  });

  return { deducted: true, alreadyDeducted: false };
}

/** 관리자: 마일리지 결제 환불 (멱등) */
export async function refundMileageForRide(
  tx: Prisma.TransactionClient,
  params: { userId: string; rideId: string; reason?: string }
): Promise<{ refunded: boolean; amount: number; alreadyRefunded: boolean }> {
  const useRow = await findRideMileageUse(tx, params.userId, params.rideId);
  if (!useRow) {
    throw new Error('NO_MILEAGE_DEDUCTION');
  }

  const existingRefund = await findRideMileageRefund(tx, params.userId, params.rideId);
  if (existingRefund) {
    return { refunded: false, amount: existingRefund.amount, alreadyRefunded: true };
  }

  const refundAmount = Math.abs(useRow.amount);
  const user = await tx.user.findUnique({ where: { id: params.userId } });
  if (!user) throw new Error('USER_NOT_FOUND');

  const newBalance = user.mileageBalance + refundAmount;
  const desc =
    params.reason?.trim() || mileageRideRefundDescription(params.rideId);

  await tx.user.update({
    where: { id: params.userId },
    data: { mileageBalance: newBalance },
  });

  await tx.mileageHistory.create({
    data: {
      userId: params.userId,
      type: 'earn',
      amount: refundAmount,
      balance: newBalance,
      description: desc.startsWith('마일리지 결제 환불')
        ? desc
        : `${mileageRideRefundDescription(params.rideId)} · ${desc}`,
    },
  });

  return { refunded: true, amount: refundAmount, alreadyRefunded: false };
}
