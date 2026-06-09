/**
 * 기프티콘 상점 상품 등록 (관리자 POST /admin/gifticon/products 와 동일)
 *
 * Usage:
 *   node scripts/register-gifticon-product.mjs G00001841164
 *   node scripts/register-gifticon-product.mjs G00001841164 --mileage 22000
 */
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.GIFTISHOW_BASE_URL ?? 'https://bizapi.giftishow.com/bizApi';

function parseArgs(argv) {
  const codes = [];
  let mileageOverride = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mileage' && argv[i + 1]) {
      mileageOverride = Number(argv[++i]);
      continue;
    }
    if (a.startsWith('G') && a.length > 5) codes.push(a.trim().toUpperCase());
  }
  return { codes, mileageOverride };
}

async function fetchGoodsDetail(goodsCode) {
  const body = new URLSearchParams({
    api_code: process.env.GIFTISHOW_API_CODE_GOODS_DETAIL?.trim() || '0111',
    custom_auth_code: process.env.GIFTISHOW_AUTH_CODE?.trim() ?? '',
    custom_auth_token: process.env.GIFTISHOW_AUTH_TOKEN?.trim() ?? '',
    dev_yn: process.env.GIFTISHOW_DEV_YN?.trim()?.toUpperCase() === 'Y' ? 'Y' : 'N',
  });
  const res = await fetch(`${BASE_URL}/goods/${goodsCode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (data.code !== '0000' && data.resCode !== '0000') {
    throw new Error(data.message || data.resMsg || `상품 조회 실패: ${goodsCode}`);
  }
  return data.result?.goodsDetail ?? data.result ?? data;
}

async function registerOne(prisma, goodsCode, mileageOverride) {
  const detail = await fetchGoodsDetail(goodsCode);
  const name = String(detail.goodsName ?? detail.goodsNm ?? goodsCode).trim();
  const price = Number(detail.realPrice ?? detail.salePrice ?? detail.discountPrice ?? 0);
  const mileagePrice =
    Number.isFinite(mileageOverride) && mileageOverride > 0
      ? Math.round(mileageOverride)
      : Math.round(price);
  const imageUrl =
    String(detail.goodsImgS ?? detail.mmsGoodsImg ?? detail.goodsImgB ?? '').trim() || null;
  const brand = String(detail.brandName ?? detail.brandNm ?? '').trim();

  if (!mileagePrice) throw new Error(`${goodsCode}: 가격 정보 없음`);

  const code = `GIFTICON_${goodsCode}`;
  const row = await prisma.coupon.upsert({
    where: { code },
    create: {
      code,
      name: brand ? `${brand} ${name}` : name,
      type: 'giftcard',
      imageUrl,
      amount: mileagePrice,
      giftishowGoodsCode: goodsCode,
      validUntil: null,
    },
    update: {
      name: brand ? `${brand} ${name}` : name,
      imageUrl,
      amount: mileagePrice,
      giftishowGoodsCode: goodsCode,
    },
    select: { giftishowGoodsCode: true, name: true, amount: true, imageUrl: true },
  });

  console.log('OK', JSON.stringify(row));
}

const { codes, mileageOverride } = parseArgs(process.argv.slice(2));
if (!codes.length) {
  console.error('Usage: node scripts/register-gifticon-product.mjs G0000... [--mileage 22000]');
  process.exit(1);
}
if (!process.env.GIFTISHOW_AUTH_CODE?.trim() || !process.env.GIFTISHOW_AUTH_TOKEN?.trim()) {
  console.error('GIFTISHOW_AUTH_CODE / GIFTISHOW_AUTH_TOKEN 필요 (.env)');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  for (const goodsCode of codes) {
    await registerOne(prisma, goodsCode, mileageOverride);
  }
} finally {
  await prisma.$disconnect();
}
