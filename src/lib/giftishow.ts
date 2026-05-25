/**
 * 기프티쇼 비즈 API (bizapi.giftishow.com)
 * - 0101: 상품 목록 (/goods) — GIFTISHOW_API_CODE_GOODS
 * - 0201: 쿠폰 발송 내역 조회 (/coupons, tr_id)
 * - send: MMS 기프티콘 발송 (/send) — GIFTISHOW_API_CODE_SEND
 * - cancel, resend — GIFTISHOW_API_CODE_CANCEL / RESEND
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

export function isGiftishowEnabled(): boolean {
  return !!(
    process.env.GIFTISHOW_AUTH_CODE?.trim() &&
    process.env.GIFTISHOW_AUTH_TOKEN?.trim() &&
    process.env.GIFTISHOW_USER_ID?.trim()
  );
}

/** user_coupon.id 기반 대사용 TR_ID (기프티쇼 대사값) */
export function buildGiftishowTrId(userCouponId: string): string {
  const prefix = 'RIDE_';
  const id = String(userCouponId).replace(/[^a-zA-Z0-9]/g, '');
  const maxLen = 40;
  const raw = prefix + id;
  return raw.length <= maxLen ? raw : prefix + id.slice(-(maxLen - prefix.length));
}

function isOk(data: GiftishowBaseResponse): boolean {
  return data.resCode === '0000' || data.code === '0000';
}

function apiError(data: GiftishowBaseResponse, fallback: string): string {
  return data.resMsg || data.message || data.resCode || data.code || fallback;
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

/** API 0101 — 상품 목록 */
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
    throw new Error(apiError(data, '상품 목록 조회 실패'));
  }

  const goodsList = data.result?.goodsList;
  const list = Array.isArray(goodsList)
    ? goodsList
    : goodsList && typeof goodsList === 'object'
      ? Object.values(goodsList)
      : [];

  return { list, listNum: data.result?.listNum };
}

/** API send — MMS 기프티콘 발송 */
export async function giftishowSend(params: GiftishowSendParams): Promise<GiftishowBaseResponse> {
  const apiCode = process.env.GIFTISHOW_API_CODE_SEND?.trim();
  if (!apiCode) {
    throw new Error('GIFTISHOW_API_CODE_SEND 미설정 (규격서의 발송 api_code)');
  }

  const phone = digitsOnly(params.phoneNo);
  if (phone.length < 10 || phone.length > 11) {
    throw new Error('유효하지 않은 수신번호');
  }

  const body: Record<string, string> = {
    ...authParams(apiCode),
    goods_code: params.goodsCode.trim(),
    mms_title: params.mmsTitle.trim(),
    mms_msg: params.mmsMsg.trim(),
    callback_no: digitsOnly(params.callbackNo),
    phone_no: phone,
    tr_id: params.trId.trim(),
    user_id: params.userId.trim(),
    rev_info_yn: params.revInfoYn ?? 'N',
  };

  if (params.orderNo) body.order_no = params.orderNo.trim();
  if (params.revInfoDate) body.rev_info_date = params.revInfoDate;
  if (params.revInfoTime) body.rev_info_time = params.revInfoTime;
  if (params.templateId) body.template_id = params.templateId;
  if (params.bannerId) body.banner_id = params.bannerId;
  if (params.gubun) body.gubun = params.gubun;

  const data = await postForm<GiftishowBaseResponse>('/send', body);
  if (!isOk(data)) {
    throw new Error(apiError(data, '기프티콘 발송 실패'));
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
    throw new Error(apiError(data, '쿠폰 발송 내역 조회 실패'));
  }

  return data.couponInfoList ?? [];
}

/** 발송 API 성공 후 0201으로 수신 완료 여부 확인 (sendRstCd 1000 = Success) */
export async function giftishowVerifySendSuccess(trId: string): Promise<GiftishowCouponInfo | null> {
  const list = await giftishowGetCouponByTrId(trId);
  const ok = list.find((c) => c.sendRstCd === '1000' || c.sendRstMsg === 'Success');
  return ok ?? list[0] ?? null;
}

/** API cancel — 발송 취소 */
export async function giftishowCancel(trId: string, userId?: string): Promise<GiftishowBaseResponse> {
  const apiCode = process.env.GIFTISHOW_API_CODE_CANCEL?.trim();
  if (!apiCode) {
    throw new Error('GIFTISHOW_API_CODE_CANCEL 미설정');
  }

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

/** API resend — 재발송 */
export async function giftishowResend(trId: string, userId?: string): Promise<GiftishowBaseResponse> {
  const apiCode = process.env.GIFTISHOW_API_CODE_RESEND?.trim();
  if (!apiCode) {
    throw new Error('GIFTISHOW_API_CODE_RESEND 미설정');
  }

  const data = await postForm<GiftishowBaseResponse>('/resend', {
    ...authParams(apiCode),
    tr_id: trId.trim(),
    user_id: (userId ?? getBizUserId()).trim(),
  });

  if (!isOk(data)) {
    throw new Error(apiError(data, '쿠폰 재발송 실패'));
  }
  return data;
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

export { getBizUserId, getCallbackNo, getDevYn };
