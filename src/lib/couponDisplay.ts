/** 앱 쿠폰함 type 필드 — DB 값이 없을 때 code/name으로 보조 추론 */
export type CouponDisplayType =
  | 'starbucks'
  | 'chicken'
  | 'convenience'
  | 'giftcard'
  | 'other';

const ALLOWED: readonly CouponDisplayType[] = [
  'starbucks',
  'chicken',
  'convenience',
  'giftcard',
  'other',
];

export function normalizeCouponType(raw: string | null | undefined): CouponDisplayType {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (ALLOWED.includes(s as CouponDisplayType)) return s as CouponDisplayType;
  return 'other';
}

export function inferCouponType(
  code: string,
  name: string | null | undefined,
  dbType: string | null | undefined,
): CouponDisplayType {
  const fromDb = normalizeCouponType(dbType);
  if (fromDb !== 'other') return fromDb;

  const hay = `${code} ${name ?? ''}`.toLowerCase();
  if (/starbucks|스타벅스|star_|star-/.test(hay)) return 'starbucks';
  if (/kyochon|교촌|chicken|치킨|kyo/.test(hay)) return 'chicken';
  if (/\bcu\b|gs25|편의점|convenience|세븐|이마트24/.test(hay)) return 'convenience';
  if (/gift|기프트|상품권|문화상품권/.test(hay)) return 'giftcard';
  return 'other';
}
