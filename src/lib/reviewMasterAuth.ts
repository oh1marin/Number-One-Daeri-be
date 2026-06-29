import { User } from '@prisma/client';
import { prisma } from './prisma';
import { findUserByPhone, normalizePhone } from './phoneUser';

/** App Store 심사용 마스터 계정 — SMS 없이 고정 OTP로 로그인/가입 */
export const REVIEW_MASTER_PHONE =
  process.env.APP_REVIEW_MASTER_PHONE?.trim() || '01012345678';
export const REVIEW_MASTER_OTP = process.env.APP_REVIEW_MASTER_OTP?.trim() || '111111';
const REVIEW_MASTER_MILEAGE = Number(process.env.APP_REVIEW_MASTER_MILEAGE) || 1_000_000;
const REVIEW_MASTER_NAME = 'App Store Review';

export function isReviewMasterAuthEnabled(): boolean {
  return process.env.APP_REVIEW_MASTER_ENABLED !== 'false';
}

export function isReviewMasterPhone(phone: string): boolean {
  if (!isReviewMasterAuthEnabled()) return false;
  return normalizePhone(phone) === normalizePhone(REVIEW_MASTER_PHONE);
}

export function matchesReviewMasterCredentials(phone: string, code: string): boolean {
  if (!isReviewMasterAuthEnabled()) return false;
  return (
    isReviewMasterPhone(phone) && String(code ?? '').trim() === REVIEW_MASTER_OTP
  );
}

/** 심사 계정 생성·복구 + 마일리지 충전 (호출·마일리지 결제 등 전 기능 테스트용) */
export async function ensureReviewMasterUser(normalizedPhone: string): Promise<User> {
  let user = await findUserByPhone(normalizedPhone);

  if (user?.deletedAt) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        deletedAt: null,
        name: REVIEW_MASTER_NAME,
        mileageBalance: REVIEW_MASTER_MILEAGE,
        signupBonusRemaining: 0,
      },
    });
    return user;
  }

  if (user) {
    const needsMileage = user.mileageBalance < REVIEW_MASTER_MILEAGE;
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: user.name === '앱 사용자' ? REVIEW_MASTER_NAME : user.name,
        ...(needsMileage ? { mileageBalance: REVIEW_MASTER_MILEAGE } : {}),
        signupBonusRemaining: 0,
      },
    });
    return user;
  }

  return prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        phone: normalizedPhone,
        name: REVIEW_MASTER_NAME,
        mileageBalance: REVIEW_MASTER_MILEAGE,
        signupBonusRemaining: 0,
      },
    });
    await tx.customer.create({
      data: {
        registeredAt: new Date(),
        dmSend: false,
        smsSend: false,
        category: '앱회원',
        name: u.name,
        phone: normalizedPhone,
        mobile: normalizedPhone,
      },
    });
    await tx.mileageHistory.create({
      data: {
        userId: u.id,
        type: 'earn',
        amount: REVIEW_MASTER_MILEAGE,
        balance: REVIEW_MASTER_MILEAGE,
        description: 'App Store 심사용 테스트 계정',
      },
    });
    return u;
  });
}
