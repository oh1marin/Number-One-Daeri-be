import type { Request } from 'express';
import { ADMIN_ACCESS_COOKIE } from './adminSessionCookies';

/**
 * 관리자 API 인증: web-admin 은 httpOnly `ride_admin_at` 만 사용(로그인 응답 JSON 토큰 불필요).
 * Bearer 는 스크립트/도구 호출용으로 선택 지원.
 */
export function getAdminAccessToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  const c = req.cookies?.[ADMIN_ACCESS_COOKIE];
  if (typeof c === 'string' && c.trim()) return c.trim();
  return null;
}
