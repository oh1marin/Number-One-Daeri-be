/**
 * 토스페이먼츠 코어 API
 * @see https://docs.tosspayments.com/reference
 * @see https://docs.tosspayments.com/reference/using-api/authorization
 * @see https://github.com/tosspayments/tosspayments-sample/tree/main/express-javascript
 *   - 결제위젯: clientKey=test_gck_, confirm 시크릿=test_gsk_
 *   - 결제창(API): clientKey=test_ck_, confirm 시크릿=test_sk_
 */

import axios, { AxiosError } from 'axios';

const DEFAULT_BASE_URL = 'https://api.tosspayments.com/v1';

export type TossEasyPay = {
  provider?: string;
  amount?: number;
  discountAmount?: number;
};

export type TossPayment = {
  version?: string;
  paymentKey: string;
  type?: string;
  orderId: string;
  orderName?: string;
  mId?: string;
  currency?: string;
  method?: string | null;
  totalAmount: number;
  balanceAmount?: number;
  status: string;
  requestedAt?: string;
  approvedAt?: string | null;
  receipt?: { url?: string } | null;
  easyPay?: TossEasyPay | null;
  card?: { number?: string; approveNo?: string } | null;
  secret?: string | null;
  failure?: { code?: string; message?: string } | null;
};

export type TossApiErrorBody = {
  code?: string;
  message?: string;
};

export type TossConfirmResult =
  | { ok: true; payment: TossPayment }
  | { ok: false; status: number; code?: string; message: string };

function getBaseUrl(): string {
  return process.env.TOSS_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

function cleanEnv(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim().replace(/^\uFEFF/, '');
  return v.length > 0 ? v : null;
}

export function isTossWidgetClientKey(key: string): boolean {
  const k = key.trim();
  return k.startsWith('test_gck_') || k.startsWith('live_gck_');
}

export function isTossWidgetSecretKey(key: string): boolean {
  const k = key.trim();
  return k.startsWith('test_gsk_') || k.startsWith('live_gsk_');
}

export function isTossApiSecretKey(key: string): boolean {
  const k = key.trim();
  return k.startsWith('test_sk_') || k.startsWith('live_sk_');
}

/** 결제위젯 클라이언트 키 (test_gck_ / live_gck_) */
export function getTossWidgetClientKey(): string | null {
  const widget = cleanEnv(process.env.TOSS_WIDGET_CLIENT_KEY);
  if (widget && isTossWidgetClientKey(widget)) return widget;

  const legacy = cleanEnv(process.env.TOSS_CLIENT_KEY);
  if (legacy && isTossWidgetClientKey(legacy)) return legacy;

  return null;
}

/** 결제위젯 시크릿 키 (test_gsk_ / live_gsk_) — /confirm/widget */
export function getTossWidgetSecretKey(): string | null {
  const widget = cleanEnv(process.env.TOSS_WIDGET_SECRET_KEY);
  if (widget && isTossWidgetSecretKey(widget)) return widget;

  const legacy = cleanEnv(process.env.TOSS_SECRET_KEY);
  if (legacy && isTossWidgetSecretKey(legacy)) return legacy;

  return null;
}

/** API 개별 연동 시크릿 (test_sk_ / live_sk_) — 결제창/브랜드페이 */
export function getTossApiSecretKey(): string | null {
  const api = cleanEnv(process.env.TOSS_API_SECRET_KEY);
  if (api && isTossApiSecretKey(api)) return api;

  const legacy = cleanEnv(process.env.TOSS_SECRET_KEY);
  if (legacy && isTossApiSecretKey(legacy)) return legacy;

  return null;
}

/** @deprecated [getTossWidgetClientKey] */
export function getTossClientKey(): string | null {
  return getTossWidgetClientKey();
}

export function tossWidgetKeySetupHint(): string {
  const parts: string[] = [];

  if (!getTossWidgetClientKey()) {
    const legacy = cleanEnv(process.env.TOSS_CLIENT_KEY);
    if (legacy && !isTossWidgetClientKey(legacy)) {
      parts.push(
        'TOSS_WIDGET_CLIENT_KEY=test_gck_... (결제위젯 연동 클라이언트 키)가 필요합니다. test_ck_는 결제창용입니다.'
      );
    } else {
      parts.push('TOSS_WIDGET_CLIENT_KEY=test_gck_... 를 설정해 주세요.');
    }
  }

  if (!getTossWidgetSecretKey()) {
    const legacy = cleanEnv(process.env.TOSS_SECRET_KEY);
    if (legacy && isTossApiSecretKey(legacy)) {
      parts.push(
        'TOSS_WIDGET_SECRET_KEY=test_gsk_... (결제위젯 시크릿 키)가 필요합니다. test_sk_는 결제위젯 승인에 사용할 수 없습니다.'
      );
    } else {
      parts.push('TOSS_WIDGET_SECRET_KEY=test_gsk_... 를 설정해 주세요.');
    }
  }

  return parts.join(' ');
}

/** 앱 결제위젯 플로우 — gck + gsk */
export function isTossConfigured(): boolean {
  return Boolean(getTossWidgetClientKey() && getTossWidgetSecretKey());
}

function basicAuth(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`, 'utf8').toString('base64')}`;
}

function widgetAuthorizationHeader(): string {
  const key = getTossWidgetSecretKey();
  if (!key) throw new Error('TOSS_WIDGET_SECRET_KEY is not configured');
  return basicAuth(key);
}

function apiAuthorizationHeader(): string {
  const key = getTossApiSecretKey();
  if (!key) throw new Error('TOSS_API_SECRET_KEY is not configured');
  return basicAuth(key);
}

function buildWidgetHeaders(idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: widgetAuthorizationHeader(),
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey.slice(0, 300);
  return headers;
}

function buildApiHeaders(idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: apiAuthorizationHeader(),
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey.slice(0, 300);
  return headers;
}

function parseAxiosError(err: unknown): { status: number; code?: string; message: string } {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<TossApiErrorBody>;
    const status = ax.response?.status ?? 502;
    const data = ax.response?.data;
    return {
      status,
      code: data?.code,
      message: data?.message ?? ax.message ?? '토스페이먼츠 API 요청에 실패했습니다.',
    };
  }
  return { status: 502, message: String(err) };
}

/** 결제 준비 시 orderId — `RIDE_{paymentId}` (6~64자) */
export function tossOrderIdFromPaymentId(paymentId: string): string {
  return `RIDE_${paymentId}`;
}

export function parsePaymentIdFromTossOrderId(orderId: string): string | null {
  const trimmed = orderId.trim();
  if (!trimmed.startsWith('RIDE_')) return null;
  const id = trimmed.slice(5);
  return id.length > 0 ? id : null;
}

/** 토스 Payment.method + easyPay → 앱 결제수단 */
export function mapTossMethodToAppMethod(payment: TossPayment): 'card' | 'kakaopay' | 'tosspay' {
  if (payment.method === '간편결제' && payment.easyPay?.provider) {
    const provider = payment.easyPay.provider.toUpperCase();
    if (provider.includes('KAKAO') || provider === 'KAKAOPAY') return 'kakaopay';
    if (provider.includes('TOSS') || provider === 'TOSSPAY') return 'tosspay';
  }
  return 'card';
}

export function tossReceiptUrl(payment: TossPayment): string | null {
  return payment.receipt?.url?.trim() || null;
}

export function tossWebhookSecretFromRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.tossSecret === 'string' && o.tossSecret.trim()) return o.tossSecret.trim();
  const toss = o.toss;
  if (toss && typeof toss === 'object') {
    const secret = (toss as Record<string, unknown>).secret;
    if (typeof secret === 'string' && secret.trim()) return secret.trim();
  }
  return null;
}

/**
 * POST /v1/payments/confirm — 결제위젯 승인 (widgetSecretKey 사용)
 * @see express-javascript/server.js POST /confirm/widget
 */
export async function confirmTossPayment(
  paymentKey: string,
  orderId: string,
  amount: number,
  idempotencyKey?: string
): Promise<TossConfirmResult> {
  try {
    const res = await axios.post<TossPayment>(
      `${getBaseUrl()}/payments/confirm`,
      { paymentKey, orderId, amount },
      { headers: buildWidgetHeaders(idempotencyKey), timeout: 30000 }
    );
    return { ok: true, payment: res.data };
  } catch (err) {
    const parsed = parseAxiosError(err);
    return { ok: false, status: parsed.status, code: parsed.code, message: parsed.message };
  }
}

/** GET /v1/payments/{paymentKey} */
export async function getTossPaymentByKey(
  paymentKey: string
): Promise<{ ok: true; payment: TossPayment } | { ok: false; status: number; message: string }> {
  try {
    const res = await axios.get<TossPayment>(
      `${getBaseUrl()}/payments/${encodeURIComponent(paymentKey)}`,
      { headers: buildWidgetHeaders(), timeout: 15000 }
    );
    return { ok: true, payment: res.data };
  } catch (err) {
    const parsed = parseAxiosError(err);
    return { ok: false, status: parsed.status, message: parsed.message };
  }
}

/** GET /v1/payments/orders/{orderId} */
export async function getTossPaymentByOrderId(
  orderId: string
): Promise<{ ok: true; payment: TossPayment } | { ok: false; status: number; message: string }> {
  try {
    const res = await axios.get<TossPayment>(
      `${getBaseUrl()}/payments/orders/${encodeURIComponent(orderId)}`,
      { headers: buildWidgetHeaders(), timeout: 15000 }
    );
    return { ok: true, payment: res.data };
  } catch (err) {
    const parsed = parseAxiosError(err);
    return { ok: false, status: parsed.status, message: parsed.message };
  }
}

/**
 * POST /v1/payments/{paymentKey}/cancel — 결제위젯 결제 취소
 */
export async function cancelTossPayment(
  paymentKey: string,
  cancelReason: string,
  cancelAmount?: number,
  idempotencyKey?: string
): Promise<{ success: boolean; payment?: TossPayment; error?: string }> {
  try {
    const body: { cancelReason: string; cancelAmount?: number } = {
      cancelReason: cancelReason.slice(0, 200),
    };
    if (cancelAmount != null && cancelAmount > 0) {
      body.cancelAmount = cancelAmount;
    }

    const res = await axios.post<TossPayment>(
      `${getBaseUrl()}/payments/${encodeURIComponent(paymentKey)}/cancel`,
      body,
      { headers: buildWidgetHeaders(idempotencyKey), timeout: 30000 }
    );
    return { success: true, payment: res.data };
  } catch (err) {
    const parsed = parseAxiosError(err);
    return { success: false, error: parsed.message };
  }
}
