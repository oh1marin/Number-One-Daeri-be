import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import { getAdminAccessToken } from '../lib/getAdminBearerOrCookie';
import { jsonError } from '../lib/jsonError';

declare global {
  namespace Express {
    interface Request {
      admin?: { id: string; email: string; name: string };
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = getAdminAccessToken(req);
    if (!token) {
      jsonError(res, 401, '인증이 필요합니다.');
      return;
    }
    const payload = verifyAccessToken(token) as TokenPayload;

    if (!payload.adminId) {
      jsonError(res, 401, '유효하지 않은 토큰입니다.');
      return;
    }

    const admin = await prisma.admin.findUnique({
      where: { id: payload.adminId },
    });

    if (!admin) {
      jsonError(res, 401, '사용자를 찾을 수 없습니다.');
      return;
    }

    req.admin = { id: admin.id, email: admin.email, name: admin.name };
    next();
  } catch {
    jsonError(res, 401, '유효하지 않은 토큰입니다.');
  }
}
