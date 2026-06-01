import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { jsonError } from '../lib/jsonError';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string | null; phone?: string | null; name: string };
    }
  }
}

export async function userAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      jsonError(res, 401, '인증이 필요합니다.', { code: 'AUTH_REQUIRED' });
      return;
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token) as TokenPayload;

    if (!payload.userId) {
      jsonError(res, 401, '유효하지 않은 토큰입니다.', { code: 'TOKEN_INVALID', clearSession: true });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.userId, deletedAt: null },
    });

    if (!user) {
      jsonError(res, 401, '사용자를 찾을 수 없습니다. 다시 로그인해 주세요.', {
        code: 'ACCOUNT_DELETED',
        clearSession: true,
      });
      return;
    }

    req.user = { id: user.id, email: user.email ?? undefined, phone: user.phone ?? undefined, name: user.name };
    next();
  } catch {
    jsonError(res, 401, '유효하지 않은 토큰입니다.', { code: 'TOKEN_INVALID', clearSession: true });
  }
}
