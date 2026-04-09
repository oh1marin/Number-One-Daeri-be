import type { Response } from 'express';

/** 관리자·앱 공통: 프론트가 `error` 또는 `message` 중 아무거나 읽도록 동일 문자열 유지 */
export function jsonError(res: Response, status: number, error: string): void {
  res.status(status).json({ success: false, error, message: error });
}

export function jsonServerError(res: Response, e: unknown): void {
  const dev = process.env.NODE_ENV !== 'production';
  const msg = dev && e != null ? String(e) : '서버 오류가 발생했습니다.';
  res.status(500).json({ success: false, error: msg, message: msg });
}
