import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
try {
  const orders = await p.gifticonOrder.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      goodsCode: true,
      goodsName: true,
      price: true,
      status: true,
      errorMessage: true,
      giftishowTrId: true,
      createdAt: true,
    },
  });
  console.log('=== recent gifticon_orders ===');
  console.log(JSON.stringify(orders, null, 2));

  const coupons = await p.coupon.findMany({
    where: {
      OR: [
        { giftishowGoodsCode: { not: null } },
        { code: { startsWith: 'GIFTICON_' } },
      ],
    },
    select: {
      code: true,
      name: true,
      amount: true,
      giftishowGoodsCode: true,
      type: true,
      validUntil: true,
    },
  });
  console.log('=== gifticon coupons ===');
  console.log(JSON.stringify(coupons, null, 2));
} finally {
  await p.$disconnect();
}
