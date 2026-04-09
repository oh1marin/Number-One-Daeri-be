import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
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
      res.status(401).json({ success: false, error: '인증이 필요합니다.' });
      return;
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token) as TokenPayload;

    if (!payload.userId) {
      res.status(401).json({ success: false, error: '유효하지 않은 토큰입니다.' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.userId, deletedAt: null },
    });

    if (!user) {
      res.status(401).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
      return;
    }

    req.user = { id: user.id, email: user.email ?? undefined, phone: user.phone ?? undefined, name: user.name };
    next();
  } catch {
    res.status(401).json({ success: false, error: '유효하지 않은 토큰입니다.' });
  }
}
