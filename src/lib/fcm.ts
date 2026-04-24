import admin from 'firebase-admin';
import { prisma } from './prisma';

/**
 * Firebase Admin — FCM 데이터 알림
 * 환경변수 FIREBASE_SERVICE_ACCOUNT_JSON 에 서비스 계정 JSON 전체(한 줄 또는 이스케이프) 설정.
 * 미설정 시 발송은 건너뛰고 API는 정상 동작.
 */

function getMessaging(): admin.messaging.Messaging | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    if (!admin.apps.length) {
      const cred = JSON.parse(raw) as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(cred),
      });
    }
    return admin.messaging();
  } catch (e) {
    console.error('[FCM] 초기화 실패 — FIREBASE_SERVICE_ACCOUNT_JSON 확인:', e);
    return null;
  }
}

/** 관리자 마일리지 조정 알림 — 앱 data: type=mileage, route=/mileage (값은 모두 문자열) */
export async function sendMileageAdjustNotification(
  userId: string,
  delta: number,
  newBalance: number,
  description: string,
): Promise<void> {
  const messaging = getMessaging();
  if (!messaging) return;

  const tokens = await prisma.userPushToken.findMany({
    where: { userId },
    select: { token: true },
  });
  if (tokens.length === 0) {
    return;
  }

  const isEarn = delta > 0;
  const title = isEarn ? '마일리지 적립' : '마일리지 차감';
  const body = isEarn
    ? `${Math.abs(delta).toLocaleString('ko-KR')}P가 적립되었습니다. 잔액 ${newBalance.toLocaleString('ko-KR')}P`
    : `${Math.abs(delta).toLocaleString('ko-KR')}P가 차감되었습니다. 잔액 ${newBalance.toLocaleString('ko-KR')}P`;

  const data: Record<string, string> = {
    type: 'mileage',
    title,
    body,
    route: '/mileage',
    amount: String(delta),
    balance: String(newBalance),
    description: description.slice(0, 200),
  };

  const results = await Promise.allSettled(
    tokens.map((t) =>
      messaging.send({
        token: t.token,
        // data-only는 백그라운드/종료 상태에서 OS가 알림을 자동 표시하지 않을 수 있어
        // notification을 함께 포함(데이터 라우팅은 data 유지)
        notification: { title, body },
        data,
        android: {
          priority: 'high',
          notification: { title, body, sound: 'default' },
        },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: { aps: { sound: 'default' } },
        },
      }),
    ),
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.warn(
      `[FCM] mileage 알림 일부 실패 userId=${userId} 실패=${failed}/${tokens.length}`,
    );
  }

  // UNREGISTERED 등 영구 실패 토큰 정리(다음 발송 성공률 개선)
  const invalidTokens: string[] = [];
  results.forEach((r, idx) => {
    if (r.status !== 'rejected') return;
    const e = r.reason as { errorInfo?: { code?: string } } | undefined;
    const code = e?.errorInfo?.code ?? '';
    if (code === 'messaging/registration-token-not-registered') {
      invalidTokens.push(tokens[idx]!.token);
    }
  });
  if (invalidTokens.length > 0) {
    await prisma.userPushToken.deleteMany({ where: { token: { in: invalidTokens } } });
    console.warn(`[FCM] UNREGISTERED 토큰 정리 userId=${userId} count=${invalidTokens.length}`);
  }
}
