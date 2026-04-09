/**
 * PROMO 쿠폰(validUntil)을 "1년"으로 설정
 *
 * 사용:
 * - npx ts-node scripts/set-promo-coupons-validUntil-1y.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COUPON_CODES = ['STARBUCKS_5000', 'KYOCHON_25000'];

function addYears(d: Date, years: number): Date {
  const out = new Date(d.getTime());
  out.setFullYear(out.getFullYear() + years);
  return out;
}

async function main() {
  const now = new Date();
  const validUntil = addYears(now, 1);
  // "1년 기간"의 의미를 운영에서 보기 좋게 끝 날짜로 맞춤
  validUntil.setHours(23, 59, 59, 999);

  console.log(`Setting promo coupon validUntil = ${validUntil.toISOString()}`);

  for (const code of COUPON_CODES) {
    const exists = await prisma.coupon.findUnique({ where: { code } });
    if (!exists) {
      console.log(`- skip (not found): ${code}`);
      continue;
    }

    await prisma.coupon.update({
      where: { code },
      data: { validUntil },
    });
    console.log(`- updated: code=${code}, id=${exists.id}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

