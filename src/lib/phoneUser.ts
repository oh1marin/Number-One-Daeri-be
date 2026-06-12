import { prisma } from './prisma';

export function normalizePhone(phone: string): string {
  return String(phone).replace(/\D/g, '').trim();
}

/** 동일 전화번호 = 동일 계정 (탈퇴 계정 포함) */
export async function findUserByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return prisma.user.findFirst({
    where: { phone: normalized },
    orderBy: { createdAt: 'asc' },
  });
}
