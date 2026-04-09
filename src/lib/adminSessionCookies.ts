import type { CookieOptions, Response } from 'express';

/**
 * 관리자 웹(web-admin) 세션: 액세스/리프레시 JWT를 httpOnly 쿠키로만 전달합니다.
 * Path=/api/v1/admin 이므로 `credentials: "include"`로 호출하는 `/api/v1/admin/*` 요청에만 붙습니다.
 * 크로스 사이트(다른 도메인)면 `ADMIN_COOKIE_SAMESITE=none` + HTTPS(`Secure`).
 */
export const ADMIN_ACCESS_COOKIE = 'ride_admin_at';
export const ADMIN_REFRESH_COOKIE = 'ride_admin_rt';

const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '1h';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';

/** DB refreshToken.expiresAt — JWT 리프레시 만료와 맞춤 */
export function getAdminRefreshTokenExpiresAt(): Date {
  const m = String(REFRESH_EXPIRES).trim().match(/^(\d+)([smhd])$/i);
  let ms = 7 * 24 * 60 * 60 * 1000;
  if (m) {
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    if (u === 's') ms = n * 1000;
    else if (u === 'm') ms = n * 60 * 1000;
    else if (u === 'h') ms = n * 60 * 60 * 1000;
    else if (u === 'd') ms = n * 24 * 60 * 60 * 1000;
  }
  return new Date(Date.now() + ms);
}

function expiresInToMaxAgeMs(exp: string): number {
  const m = String(exp).trim().match(/^(\d+)([smhd])$/i);
  if (!m) return 60 * 60 * 1000;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (u === 's') return n * 1000;
  if (u === 'm') return n * 60 * 1000;
  if (u === 'h') return n * 60 * 60 * 1000;
  if (u === 'd') return n * 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function baseCookieOptions(maxAgeMs: number): CookieOptions {
  const prod = process.env.NODE_ENV === 'production';
  const sameSiteNone = process.env.ADMIN_COOKIE_SAMESITE === 'none';
  const domain = process.env.ADMIN_COOKIE_DOMAIN?.trim();
  return {
    httpOnly: true,
    secure: prod || sameSiteNone,
    sameSite: sameSiteNone ? 'none' : 'lax',
    path: '/api/v1/admin',
    maxAge: maxAgeMs,
    ...(domain ? { domain } : {}),
  };
}

export function setAdminSessionCookies(
  res: Response,
  accessToken: string,
  refreshToken: string
): void {
  res.cookie(ADMIN_ACCESS_COOKIE, accessToken, baseCookieOptions(expiresInToMaxAgeMs(ACCESS_EXPIRES)));
  res.cookie(ADMIN_REFRESH_COOKIE, refreshToken, baseCookieOptions(expiresInToMaxAgeMs(REFRESH_EXPIRES)));
}

export function clearAdminSessionCookies(res: Response): void {
  const p = '/api/v1/admin';
  const domain = process.env.ADMIN_COOKIE_DOMAIN?.trim();
  const opts = { path: p, ...(domain ? { domain } : {}) };
  res.clearCookie(ADMIN_ACCESS_COOKIE, opts);
  res.clearCookie(ADMIN_REFRESH_COOKIE, opts);
}
