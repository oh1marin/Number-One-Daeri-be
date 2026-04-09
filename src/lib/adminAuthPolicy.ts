/** 관리자 인증 정책 — web-admin(쿠키 세션)과 운영 보안 기준 */

export function isProductionNodeEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * 모의/개발 전용 로그인 API를 둘 때만 사용.
 * 운영에서는 항상 false — 라우트에서 이 값을 검사해 404/403 처리.
 */
export function isAdminDevMockLoginEnabled(): boolean {
  if (isProductionNodeEnv()) return false;
  return process.env.ADMIN_DEV_MOCK_LOGIN === 'true';
}

/**
 * 리프레시 토큰을 JSON body 로 받을지 여부.
 * 운영 기본: 쿠키(httpOnly)만 — body 는 로그/프록시에 노출될 수 있음.
 * ADMIN_ALLOW_REFRESH_BODY=true 이면 본문도 허용(레거시 클라이언트).
 */
export function allowAdminRefreshTokenInBody(): boolean {
  const v = process.env.ADMIN_ALLOW_REFRESH_BODY?.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return !isProductionNodeEnv();
}

/**
 * 로그인 성공 시 동일 관리자의 기존 리프레시 토큰 전부 삭제(다른 기기 세션 종료).
 * ADMIN_REVOKE_REFRESH_ON_LOGIN=true 일 때만.
 */
export function shouldRevokeOtherSessionsOnAdminLogin(): boolean {
  return process.env.ADMIN_REVOKE_REFRESH_ON_LOGIN === 'true';
}
