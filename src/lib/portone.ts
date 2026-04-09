/**
 * PortOne V2 API 클라이언트
 * - 결제 취소(환불)
 * - 결제 조회
 * @see https://developers.portone.io/api/rest-v2/
 */

import axios, { AxiosInstance } from 'axios';

const BASE_URL = 'https://api.portone.io/v2';

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

function getApiSecret(): string {
  const secret = process.env.PORTONE_API_SECRET;
  if (!secret) {
    throw new Error('PORTONE_API_SECRET is not configured');
  }
  return secret;
}

function getStoreId(): string {
  const storeId = process.env.PORTONE_STORE_ID;
  if (!storeId) {
    throw new Error('PORTONE_STORE_ID is not configured');
  }
  return storeId;
}

function getChannelKey(): string {
  const key = process.env.PORTONE_CHANNEL_KEY;
  if (!key) {
    throw new Error('PORTONE_CHANNEL_KEY is not configured');
  }
  return key;
}

/**
 * API Secret으로 액세스 토큰 발급 (캐시, 1시간 유효 가정)
 */
export async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const res = await axios.post<{ accessToken: string; refreshToken: string }>(
    `${BASE_URL}/login/api-secret`,
    { apiSecret: getApiSecret() },
    { headers: { 'Content-Type': 'application/json' } }
  );

  cachedAccessToken = res.data.accessToken;
  tokenExpiresAt = Date.now() + 60 * 60 * 1000; // 1시간
  return cachedAccessToken;
}

function createClient(): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 결제 취소(환불)
 * @param paymentId - PortOne transactionId (Flutter에서 cardToken으로 저장된 값)
 * @param amount - 취소 금액 (미입력 시 전액)
 */
export async function cancelPayment(
  paymentId: string,
  amount?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getAccessToken();
    const storeId = getStoreId();

    const body: { storeId: string; amount?: number } = { storeId };
    if (amount != null && amount > 0) {
      body.amount = amount;
    }

    await createClient().post(`/payments/${paymentId}/cancel`, body, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return { success: true };
  } catch (err: unknown) {
    const msg = axios.isAxiosError(err)
      ? err.response?.data?.message ?? err.message
      : String(err);
    return { success: false, error: msg };
  }
}

/**
 * 100원 인증 결제 환불 (카드 등록 시 사용)
 */
export async function refundAuthPayment(transactionId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  return cancelPayment(transactionId, 100);
}

/**
 * 빌링키로 결제 청구
 * @param paymentId - 가맹점 결제 고유 ID
 * @param billingKey - 빌링키 (cardToken으로 저장된 값)
 * @param amount - 결제 금액 (원)
 * @param orderName - 주문명
 */
export async function payWithBillingKey(
  paymentId: string,
  billingKey: string,
  amount: number,
  orderName: string
): Promise<{ success: boolean; pgTxId?: string; error?: string }> {
  try {
    const token = await getAccessToken();
    const storeId = getStoreId();
    const channelKey = getChannelKey();

    const body = {
      storeId,
      billingKey,
      channelKey,
      orderName,
      currency: 'KRW' as const,
      totalAmount: amount,
    };

    const res = await createClient().post(
      `/payments/${encodeURIComponent(paymentId)}/billing-key`,
      body,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const payment = res.data?.payment;
    const pgTxId = payment?.transactions?.[0]?.pgTxId ?? payment?.id;

    return { success: true, pgTxId };
  } catch (err: unknown) {
    const msg = axios.isAxiosError(err)
      ? err.response?.data?.message ?? err.message
      : String(err);
    return { success: false, error: msg };
  }
}

/**
 * PortOne 연동 가능 여부 (환경변수 설정 확인)
 */
export function isPortOneConfigured(): boolean {
  return Boolean(process.env.PORTONE_API_SECRET && process.env.PORTONE_STORE_ID);
}

/**
 * 빌링키 결제 가능 여부 (channelKey 포함)
 */
export function isBillingKeyPayConfigured(): boolean {
  return Boolean(
    process.env.PORTONE_API_SECRET &&
      process.env.PORTONE_STORE_ID &&
      process.env.PORTONE_CHANNEL_KEY
  );
}
