/**
 * PROMO 쿠폰 생성(스타벅스/교촌) 스크립트
 *
 * 사용:
 * - npx ts-node scripts/create-promo-coupons.ts
 *
 * 결과:
 * - 각 쿠폰의 id/code/amount를 콘솔에 출력
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type PromoCouponSpec = {
  code: string;
  amount: number;
  // promo 쿠폰은 기본 유효기간 제한 없음
  validUntil?: Date | null;
};

const SPECS: PromoCouponSpec[] = [
  // 스타벅스 커피 5000원
  { code: 'STARBUCKS_5000', amount: 5000, validUntil: null },
  // 교촌치킨 25000원
  { code: 'KYOCHON_25000', amount: 25000, validUntil: null },
];

async function upsertCoupon(spec: PromoCouponSpec) {
  const code = String(spec.code).trim().toUpperCase();
  const amount = Number(spec.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Invalid amount for ${code}: ${spec.amount}`);
  }

  const coupon = await prisma.coupon.upsert({
    where: { code },
    update: {
      amount,
      validUntil: spec.validUntil ?? null,
    },
    create: {
      code,
      amount,
      validUntil: spec.validUntil ?? null,
    },
  });

  return coupon;
}

async function main() {
  const created = await Promise.all(SPECS.map((s) => upsertCoupon(s)));

  console.log('✅ PROMO coupons upsert 완료');
  for (const c of created) {
    console.log(
      `- code=${c.code}, amount=${c.amount}, id=${c.id}${c.validUntil ? `, validUntil=${c.validUntil.toISOString()}` : ', validUntil=null'}`
    );
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

