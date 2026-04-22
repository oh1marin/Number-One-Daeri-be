import type { Request } from 'express';
import { createHash } from 'crypto';

export const IDEMPOTENCY_KEY_MAX_LEN = 128;

export type IdempotencyKeyResult =
  | { ok: true; key: null }
  | { ok: true; key: string }
  | { ok: false; error: string };

/** 헤더 `Idempotency-Key` 우선, 없으면 body.idempotencyKey. 미입력이면 key: null */
export function readIdempotencyKey(req: Request, bodyKey?: unknown): IdempotencyKeyResult {
  const headerRaw = req.headers['idempotency-key'];
  const fromHeader =
    typeof headerRaw === 'string'
      ? headerRaw.trim()
      : Array.isArray(headerRaw)
        ? (headerRaw[0]?.trim() ?? '')
        : '';
  const fromBody = bodyKey != null ? String(bodyKey).trim() : '';
  const raw = fromHeader || fromBody;
  if (!raw) return { ok: true, key: null };
  if (raw.length > IDEMPOTENCY_KEY_MAX_LEN) {
    return {
      ok: false,
      error: `Idempotency-Key(idempotencyKey)는 최대 ${IDEMPOTENCY_KEY_MAX_LEN}자입니다.`,
    };
  }
  return { ok: true, key: raw };
}

/** PortOne 빌링 결제 ID — 동일 멱등 키면 동일 문자열(재시도 시 PG 중복 승인 방지) */
export function portoneBillingPaymentId(userId: string, idempotencyKey: string): string {
  const h = createHash('sha256')
    .update(`portone:billing:${userId}:${idempotencyKey}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
  return `chg_${h}`;
}

export const CLIENT_CALL_ID_MAX_LEN = 128;

export type ClientCallIdResult =
  | { ok: true; id: null }
  | { ok: true; id: string }
  | { ok: false; error: string };

/** POST /rides/call 멱등용 clientCallId (앱에서 UUID 등) */
export function readClientCallId(raw: unknown): ClientCallIdResult {
  if (raw == null || raw === '') return { ok: true, id: null };
  const s = String(raw).trim();
  if (!s) return { ok: true, id: null };
  if (s.length > CLIENT_CALL_ID_MAX_LEN) {
    return { ok: false, error: `clientCallId는 최대 ${CLIENT_CALL_ID_MAX_LEN}자입니다.` };
  }
  return { ok: true, id: s };
}
