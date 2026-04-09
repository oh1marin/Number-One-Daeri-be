import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      driver?: { id: string; name: string; phone: string | null };
    }
  }
}

export async function driverAuthMiddleware(
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

    if (!payload.driverId) {
      res.status(401).json({ success: false, error: '유효하지 않은 토큰입니다.' });
      return;
    }

    const driver = await prisma.driver.findUnique({
      where: { id: payload.driverId },
    });

    if (!driver) {
      res.status(401).json({ success: false, error: '기사를 찾을 수 없습니다.' });
      return;
    }

    req.driver = { id: driver.id, name: driver.name, phone: driver.phone };
    next();
  } catch {
    res.status(401).json({ success: false, error: '유효하지 않은 토큰입니다.' });
  }
}
