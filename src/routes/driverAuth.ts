import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';

const router = Router();

// POST /driver-auth/login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      res.status(400).json({ success: false, error: 'phone, password 필수' });
      return;
    }

    const driver = await prisma.driver.findFirst({
      where: {
        OR: [
          { phone: { equals: String(phone).trim() } },
          { mobile: { equals: String(phone).trim() } },
        ],
      },
    });

    if (!driver || !driver.password) {
      res.status(401).json({ success: false, error: '전화번호 또는 비밀번호가 잘못되었습니다.' });
      return;
    }

    const valid = await bcrypt.compare(String(password), driver.password);
    if (!valid) {
      res.status(401).json({ success: false, error: '전화번호 또는 비밀번호가 잘못되었습니다.' });
      return;
    }

    const payload = { driverId: driver.id, phone: driver.phone ?? '' };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.driverRefreshToken.create({
      data: {
        token: refreshToken,
        driverId: driver.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.userLoginLog.create({
      data: {
        userId: driver.id,
        userType: 'driver',
        email: null,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? null,
      },
    });

    res.json({
      success: true,
      data: {
        driver: {
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
          mobile: driver.mobile,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /driver-auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: 'refreshToken 필수' });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);
    const stored = await prisma.driverRefreshToken.findUnique({
      where: { token: refreshToken },
    });
    if (!stored || stored.driverId !== payload.driverId) {
      res.status(401).json({ success: false, error: '유효하지 않은 토큰' });
      return;
    }
    if (stored.expiresAt < new Date()) {
      await prisma.driverRefreshToken.delete({ where: { id: stored.id } });
      res.status(401).json({ success: false, error: '토큰 만료' });
      return;
    }

    const accessToken = signAccessToken({ driverId: payload.driverId!, phone: payload.phone ?? '' });
    res.json({ success: true, data: { accessToken } });
  } catch {
    res.status(401).json({ success: false, error: '유효하지 않은 토큰' });
  }
});

export default router;
