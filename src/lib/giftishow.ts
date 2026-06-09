/**
 * 기프티쇼 비즈 API (bizapi.giftishow.com)
 * - 0101: 상품 목록 (/goods)
 * - 0111: 상품 상세 (/goods/{goods_code})
 * - 0102: 브랜드 목록 (/brands)
 * - 0112: 브랜드 상세 (/brands/{brand_code})
 * - 0201: 쿠폰 발송 내역 조회 (/coupons, tr_id)
 * - 0202: 쿠폰 취소 (/cancel)
 * - 0203: 쿠폰 재발송 (/resend)
 * - 0204: 쿠폰 발송 (/send, MMS)
 * - 0301: 비즈머니 잔액 (/bizmoney)
 *
 * 공통: POST, application/x-www-form-urlencoded, dev_yn 규격서상 'N' 권장
 */

const BASE_URL = process.env.GIFTISHOW_BASE_URL ?? 'https://bizapi.giftishow.com/bizApi';
const TIMEOUT_MS = 15000;

export type GiftishowCouponInfo = {
  goodsCd?: string;
  goodsNm?: string;
  sellPriceAmt?: string;
  senderTelNo?: string;
  cnsmPriceAmt?: string;
  sendRstCd?: string;
  mmsBrandThumImg?: string;
  brandNm?: string;
  sendRstMsg?: string;
  correcDtm?: string;
  recverTelNo?: string;
  validPrdEndDt?: string;
  sendBasicCd?: string;
  sendStatusCd?: string;
};

type GiftishowBaseResponse = {
  resCode?: string;
  resMsg?: string;
  code?: string;
  message?: string;
};

export type GiftishowSendParams = {
  goodsCode: string;
  phoneNo: string;
  trId: string;
  userId: string;
  mmsTitle: string;
  mmsMsg: string;
  callbackNo: string;
  orderNo?: string;
  revInfoYn?: 'Y' | 'N';
  revInfoDate?: string;
  revInfoTime?: string;
  templateId?: string;
  bannerId?: string;
  gubun?: 'Y' | 'N';
};

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

function getAuthCode(): string {
  const v = process.env.GIFTISHOW_AUTH_CODE?.trim();
  if (!v) throw new Error('GIFTISHOW_AUTH_CODE 미설정');
  return v;
}

function getAuthToken(): string {
  const v = process.env.GIFTISHOW_AUTH_TOKEN?.trim();
  if (!v) throw new Error('GIFTISHOW_AUTH_TOKEN 미설정');
  return v;
}

function getDevYn(): string {
  const v = process.env.GIFTISHOW_DEV_YN?.trim().toUpperCase();
  return v === 'Y' ? 'Y' : 'N';
}

function getBizUserId(): string {
  const v = process.env.GIFTISHOW_USER_ID?.trim();
  if (!v) throw new Error('GIFTISHOW_USER_ID 미설정 (기프티쇼 회원 ID)');
  return v;
}

function getCallbackNo(): string {
  const v =
    process.env.GIFTISHOW_CALLBACK_NO?.trim() ||
    process.env.SOLAPI_SENDER?.trim() ||
    '';
  const n = digitsOnly(v);
  if (n.length < 8) throw new Error('GIFTISHOW_CALLBACK_NO(발신번호) 미설정');
  return n;
}

function getDefaultTemplateId(): string | undefined {
  const v =
    process.env.GIFTISHOW_TEMPLATE_ID?.trim() ||
    process.env.GIFTISHOW_CARD_ID?.trim();
  return v || undefined;
}

function getDefaultBannerId(): string | undefined {
  const v = process.env.GIFTISHOW_BANNER_ID?.trim();
  return v || undefined;
}

export function isGiftishowEnabled(): boolean {
  return !!(
    process.env.GIFTISHOW_AUTH_CODE?.trim() &&
    process.env.GIFTISHOW_AUTH_TOKEN?.trim() &&
    process.env.GIFTISHOW_USER_ID?.trim()
  );
}

/** 기프티쇼 tr_id 최대 길이 (초과 시 "TRID is longer than 20 characters") */
export const GIFTISHOW_TR_ID_MAX_LEN = 20;

function buildGiftishowTrIdWithPrefix(prefix: string, sourceId: string): string {
  const p = String(prefix).replace(/[^a-zA-Z0-9]/g, '');
  const id = String(sourceId).replace(/[^a-zA-Z0-9]/g, '');
  if (!p) {
    return id.length <= GIFTISHOW_TR_ID_MAX_LEN ? id : id.slice(-GIFTISHOW_TR_ID_MAX_LEN);
  }
  const maxIdLen = GIFTISHOW_TR_ID_MAX_LEN - p.length;
  if (maxIdLen <= 0) return p.slice(0, GIFTISHOW_TR_ID_MAX_LEN);
  const suffix = id.length <= maxIdLen ? id : id.slice(-maxIdLen);
  return p + suffix;
}

/** user_coupon.id 기반 대사용 TR_ID (기프티쇼 대사값, 최대 20자) */
export function buildGiftishowTrId(userCouponId: string): string {
  return buildGiftishowTrIdWithPrefix('R', userCouponId);
}

function isOk(data: GiftishowBaseResponse): boolean {
  return data.resCode === '0000' || data.code === '0000';
}

function apiError(data: GiftishowBaseResponse, fallback: string): string {
  return data.resMsg || data.message || data.resCode || data.code || fallback;
}

export type GiftishowUserError = {
  message: string;
  code: string | null;
  detail: string;
};

/** 기프티쇼 API 원문 → 앱/관리자용 한글 메시지 */
export function formatGiftishowUserError(
  raw: string,
  data?: Pick<GiftishowBaseResponse, 'resCode' | 'resMsg' | 'code' | 'message'>
): GiftishowUserError {
  const detail = String(raw ?? '').trim() || '기프티콘 발송 실패';
  const code =
    String(data?.resCode ?? data?.code ?? '').trim() ||
    (detail.match(/\bE\d{4}\b/i)?.[0]?.toUpperCase() ?? null);
  const hay = `${code ?? ''} ${detail}`.toLowerCase();

  if (/e0010|biz\s*money|비즈\s*머니|balance is insufficient/.test(hay)) {
    return {
      message:
        '기프티쇼 발송 잔액(비즈머니)이 부족합니다. 충전 후 다시 시도해 주세요.',
      code: 'GIFTISHOW_BIZMONEY_INSUFFICIENT',
      detail,
    };
  }
  if (/no products requested|invalid goods|goods.?code|상품.?코드/.test(hay)) {
    return {
      message:
        '등록된 상품 코드가 올바르지 않습니다. 관리자 기프티콘 상점에서 G00000… 형식 코드를 확인해 주세요.',
      code: 'GIFTISHOW_INVALID_PRODUCT',
      detail,
    };
  }
  if (/trid|tr_id/.test(hay)) {
    return {
      message: '기프티콘 발송 요청 오류입니다. 잠시 후 다시 시도해 주세요.',
      code,
      detail,
    };
  }
  if (/e0006|invalid authorization|authorization/.test(hay)) {
    return {
      message: '기프티콘 발송 인증 오류입니다. 잠시 후 다시 시도해 주세요.',
      code: code ?? 'E0006',
      detail,
    };
  }
  if (/timeout|타임아웃|abort/.test(hay)) {
    return {
      message: '기프티쇼 연결 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
      code,
      detail,
    };
  }
  if (/phone|수신번호|callback|발신/.test(hay)) {
    return {
      message: '수신 전화번호 또는 발신번호 설정을 확인해 주세요.',
      code,
      detail,
    };
  }
  if (/already|duplicate|중복/.test(hay)) {
    return {
      message: '이미 처리된 발송 요청입니다. 교환 내역을 확인해 주세요.',
      code,
      detail,
    };
  }
  if (/[가-힣]/.test(detail)) {
    return { message: detail, code, detail };
  }
  return {
    message: '기프티콘 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    code,
    detail,
  };
}

function throwGiftishowError(data: GiftishowBaseResponse, fallback: string): never {
  const detail = apiError(data, fallback);
  const { message } = formatGiftishowUserError(detail, data);
  throw new Error(message);
}

async function postForm<T extends GiftishowBaseResponse>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = new URLSearchParams(params);
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });

    const data = (await res.json()) as T;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${apiError(data, '기프티쇼 API 오류')}`);
    }
    return data;
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('기프티쇼 API 타임아웃');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

function authParams(apiCode: string): Record<string, string> {
  return {
    api_code: apiCode,
    custom_auth_code: getAuthCode(),
    custom_auth_token: getAuthToken(),
    dev_yn: getDevYn(),
  };
}

/** API 0101 — 상품 목록 (start = 페이지 번호, 1부터) */
export async function giftishowListGoods(start = 1, size = 20): Promise<{
  list: unknown[];
  listNum?: number;
}> {
  const apiCode = process.env.GIFTISHOW_API_CODE_GOODS?.trim() || '0101';
  const data = await postForm<GiftishowBaseResponse & { result?: { goodsList?: unknown[]; listNum?: number } }>(
    '/goods',
    {
      ...authParams(apiCode),
      start: String(start),
      size: String(size),
    }
  );

  if (!isOk(data)) {
    throwGiftishowError(data, '상품 목록 조회 실패');
  }

  const goodsList = data.result?.goodsList;
  const list = Array.isArray(goodsList)
    ? goodsList
    : goodsList && typeof goodsList === 'object'
      ? Object.values(goodsList)
      : [];

  return { list, listNum: data.result?.listNum };
}

/** API 0204 — MMS 기프티콘 발송 */
export async function giftishowSend(params: GiftishowSendParams): Promise<GiftishowBaseResponse> {
  const apiCode = process.env.GIFTISHOW_API_CODE_SEND?.trim() || '0204';

  const phone = digitsOnly(params.phoneNo);
  if (phone.length < 10 || phone.length > 11) {
    throw new Error('유효하지 않은 수신번호');
  }

  const trId = params.trId.trim();
  if (!trId || trId.length > GIFTISHOW_TR_ID_MAX_LEN) {
    throw new Error(`tr_id는 1~${GIFTISHOW_TR_ID_MAX_LEN}자여야 합니다.`);
  }

  const body: Record<string, string> = {
    ...authParams(apiCode),
    goods_code: params.goodsCode.trim(),
    mms_title: params.mmsTitle.trim(),
    mms_msg: params.mmsMsg.trim(),
    callback_no: digitsOnly(params.callbackNo),
    phone_no: phone,
    tr_id: trId,
    user_id: params.userId.trim(),
    rev_info_yn: params.revInfoYn ?? 'N',
  };

  if (params.orderNo) body.order_no = params.orderNo.trim();
  if (params.revInfoDate) body.rev_info_date = params.revInfoDate;
  if (params.revInfoTime) body.rev_info_time = params.revInfoTime;
  const templateId = params.templateId ?? getDefaultTemplateId();
  const bannerId = params.bannerId ?? getDefaultBannerId();
  if (templateId) body.template_id = templateId;
  if (bannerId) body.banner_id = bannerId;
  body.gubun = params.gubun ?? 'N';

  const data = await postForm<GiftishowBaseResponse>('/send', body);
  if (!isOk(data)) {
    throwGiftishowError(data, '기프티콘 발송 실패');
  }
  return data;
}

/** API 0201 — tr_id 로 발송 결과 조회 */
export async function giftishowGetCouponByTrId(trId: string): Promise<GiftishowCouponInfo[]> {
  const apiCode = process.env.GIFTISHOW_API_CODE_COUPONS?.trim() || '0201';
  const data = await postForm<
    GiftishowBaseResponse & { couponInfoList?: GiftishowCouponInfo[] }
  >('/coupons', {
    ...authParams(apiCode),
    tr_id: trId.trim(),
  });

  if (!isOk(data)) {
    throwGiftishowError(data, '쿠폰 발송 내역 조회 실패');
  }

  return data.couponInfoList ?? [];
}

/** 발송 API 성공 후 0201으로 수신 완료 여부 확인 (sendRstCd 1000 = Success) */
export async function giftishowVerifySendSuccess(trId: string): Promise<GiftishowCouponInfo | null> {
  const list = await giftishowGetCouponByTrId(trId);
  const ok = list.find((c) => c.sendRstCd === '1000' || c.sendRstMsg === 'Success');
  return ok ?? list[0] ?? null;
}

/** API 0202 — 발송 취소 */
export async function giftishowCancel(trId: string, userId?: string): Promise<GiftishowBaseResponse> {
  const apiCode = process.env.GIFTISHOW_API_CODE_CANCEL?.trim() || '0202';

  const data = await postForm<GiftishowBaseResponse>('/cancel', {
    ...authParams(apiCode),
    tr_id: trId.trim(),
    user_id: (userId ?? getBizUserId()).trim(),
  });

  if (!isOk(data)) {
    throw new Error(apiError(data, '쿠폰 취소 실패'));
  }
  return data;
}

/** API 0203 — 재발송 */
export async function giftishowResend(
  trId: string,
  userId?: string,
  smsFlag: 'Y' | 'N' = 'N'
): Promise<GiftishowBaseResponse> {
  const apiCode = process.env.GIFTISHOW_API_CODE_RESEND?.trim() || '0203';

  const data = await postForm<GiftishowBaseResponse>('/resend', {
    ...authParams(apiCode),
    tr_id: trId.trim(),
    user_id: (userId ?? getBizUserId()).trim(),
    sms_flag: smsFlag,
  });

  if (!isOk(data)) {
    throw new Error(apiError(data, '쿠폰 재발송 실패'));
  }
  return data;
}

/** API 0301 — 비즈머니 잔액 조회 */
export async function giftishowGetBizMoney(userId?: string): Promise<number> {
  const apiCode = process.env.GIFTISHOW_API_CODE_BIZMONEY?.trim() || '0301';
  const data = await postForm<GiftishowBaseResponse & { balance?: string }>('/bizmoney', {
    ...authParams(apiCode),
    user_id: (userId ?? getBizUserId()).trim(),
  });

  if (!isOk(data)) {
    throw new Error(apiError(data, '비즈머니 잔액 조회 실패'));
  }

  const balance = Number(data.balance ?? 0);
  return Number.isFinite(balance) ? balance : 0;
}

/** 쿠폰 레코드에서 기프티쇼 goods_code 추출 */
export function resolveGiftishowGoodsCode(coupon: {
  giftishowGoodsCode?: string | null;
  code?: string;
}): string | null {
  const fromCol = coupon.giftishowGoodsCode?.trim();
  if (fromCol) return fromCol;
  const code = coupon.code?.trim() ?? '';
  if (/^G\d+/i.test(code)) return code.toUpperCase();
  return null;
}

export function defaultGiftishowMms(couponName: string, amount: number): { title: string; msg: string } {
  const name = couponName.trim() || '기프티콘';
  return {
    title: '[일등대리] 기프티콘',
    msg: `[일등대리] ${name}(${amount.toLocaleString()}원) 쿠폰이 발송되었습니다.`,
  };
}

export type GifticonProductDto = {
  id: string;
  goodsCode: string;
  name: string;
  brandName: string;
  price: number;
  imageUrl: string | null;
  category: string;
  available: boolean;
};

function parsePrice(raw: Record<string, unknown>): number {
  const n = Number(raw.realPrice ?? raw.salePrice ?? raw.discountPrice ?? raw.sellPriceAmt ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** 기프티쇼 goodsList 항목 → 앱 gifticon/products DTO */
export function mapGiftishowGoodsToProduct(raw: Record<string, unknown>): GifticonProductDto | null {
  const goodsCode = String(raw.goodsCode ?? raw.goodsCd ?? '').trim();
  if (!goodsCode) return null;
  const price = parsePrice(raw);
  const state = String(raw.goodsStateCd ?? 'SALE').toUpperCase();
  return {
    id: goodsCode,
    goodsCode,
    name: String(raw.goodsName ?? raw.goodsNm ?? goodsCode),
    brandName: String(raw.brandName ?? raw.brandNm ?? ''),
    price,
    imageUrl:
      String(raw.goodsImgS ?? raw.mmsGoodsImg ?? raw.goodsImgB ?? '').trim() || null,
    category: String(raw.goodsTypeDtlNm ?? raw.goodstypeNm ?? raw.goodsTypeNm ?? 'other'),
    available: state === 'SALE' && price > 0,
  };
}

/** goodsCode 로 기프티쇼 상품 조회 (목록 페이지 순회) */
export async function giftishowFindProduct(goodsCode: string): Promise<GifticonProductDto | null> {
  const code = goodsCode.trim().toUpperCase();
  const size = 50;
  const maxPages = Math.ceil(2500 / size);
  for (let page = 1; page <= maxPages; page++) {
    const { list } = await giftishowListGoods(page, size);
    for (const item of list) {
      if (typeof item !== 'object' || item == null) continue;
      const mapped = mapGiftishowGoodsToProduct(item as Record<string, unknown>);
      if (mapped?.goodsCode.toUpperCase() === code) return mapped;
    }
    if (list.length < size) break;
  }
  return null;
}

export function buildGifticonOrderTrId(orderId: string): string {
  return buildGiftishowTrIdWithPrefix('GC', orderId);
}

export { getBizUserId, getCallbackNo, getDevYn };
