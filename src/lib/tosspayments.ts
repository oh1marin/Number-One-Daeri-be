/**
 * 토스페이먼츠 코어 API
 * @see https://docs.tosspayments.com/reference
 * @see https://docs.tosspayments.com/reference/using-api/authorization
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

function getSecretKey(): string {
  const secret = process.env.TOSS_SECRET_KEY?.trim();
  if (!secret) throw new Error('TOSS_SECRET_KEY is not configured');
  return secret;
}

export function getTossClientKey(): string | null {
  return process.env.TOSS_CLIENT_KEY?.trim() || null;
}

export function isTossConfigured(): boolean {
  return Boolean(process.env.TOSS_SECRET_KEY?.trim());
}

function authorizationHeader(): string {
  const encoded = Buffer.from(`${getSecretKey()}:`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

function buildHeaders(idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: authorizationHeader(),
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey.slice(0, 300);
  }
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
 * POST /v1/payments/confirm — 결제 승인 (인증 후 10분 이내)
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
      { headers: buildHeaders(idempotencyKey), timeout: 30000 }
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
      { headers: buildHeaders(), timeout: 15000 }
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
      { headers: buildHeaders(), timeout: 15000 }
    );
    return { ok: true, payment: res.data };
  } catch (err) {
    const parsed = parseAxiosError(err);
    return { ok: false, status: parsed.status, message: parsed.message };
  }
}

/**
 * POST /v1/payments/{paymentKey}/cancel
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
      { headers: buildHeaders(idempotencyKey), timeout: 30000 }
    );
    return { success: true, payment: res.data };
  } catch (err) {
    const parsed = parseAxiosError(err);
    return { success: false, error: parsed.message };
  }
}
