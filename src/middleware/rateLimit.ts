import type { Request, Response, NextFunction } from 'express';
import { jsonError } from '../lib/jsonError';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** 간단 IP 기준 고정 윈도우 (프로세스 메모리). 멀티 인스턴스에서는 공유 스토어 필요 */
export function rateLimitByIp(options: { windowMs: number; max: number; keyPrefix?: string }) {
  const prefix = options.keyPrefix ?? 'rl';
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${prefix}:${ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > options.max) {
      jsonError(res, 429, '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    next();
  };
}
