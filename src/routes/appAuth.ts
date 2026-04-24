import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { generateOtpCode, getOtpExpireMinutes, sendSmsOtp } from '../lib/sms';

const router = Router();

// ─────────────────────────────────────
// 전화번호 인증 (SMS OTP)
// ─────────────────────────────────────

const DAILY_PHONE_SEND_LIMIT = 10;

function normalizePhone(phone: string): string {
  return String(phone).replace(/\D/g, '').trim();
}

function validatePhone(phone: string): boolean {
  const n = normalizePhone(phone);
  return n.length >= 10 && n.length <= 11;
}

// POST /auth/phone/send — OTP 발송
router.post('/phone/send', async (req, res) => {
  try {
    const { phone } = req.body;
    const normalized = normalizePhone(phone ?? '');
    if (!validatePhone(normalized)) {
      res.status(400).json({ success: false, error: '전화번호 형식 오류' });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sentToday = await prisma.phoneOtp.count({
      where: { phone: normalized, createdAt: { gte: today } },
    });
    if (sentToday >= DAILY_PHONE_SEND_LIMIT) {
      res.status(429).json({ success: false, error: '일일 발송 횟수 초과' });
      return;
    }

    await prisma.phoneOtp.deleteMany({ where: { phone: normalized } });

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + getOtpExpireMinutes() * 60 * 1000);

    await prisma.phoneOtp.create({
      data: { phone: normalized, code, expiresAt },
    });

    const sent = await sendSmsOtp(normalized, code);
    if (!sent) {
      res.status(502).json({ success: false, error: '문자 발송 실패' });
      return;
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: '서버 오류' });
  }
});

// POST /auth/phone/verify — OTP 검증 + 로그인/회원가입
router.post('/phone/verify', async (req, res) => {
  try {
    const { phone, code } = req.body;
    const normalized = normalizePhone(phone ?? '');
    if (!validatePhone(normalized)) {
      res.status(400).json({ success: false, error: '전화번호 형식 오류' });
      return;
    }
    if (!code || String(code).length !== 6) {
      res.status(400).json({ success: false, error: '인증번호 6자리 입력' });
      return;
    }

    const otp = await prisma.phoneOtp.findFirst({
      where: { phone: normalized },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.code !== String(code).trim()) {
      res.status(400).json({ success: false, error: '잘못된 인증번호' });
      return;
    }
    if (otp.expiresAt < new Date()) {
      res.status(400).json({ success: false, error: '인증번호 만료' });
      return;
    }

    await prisma.phoneOtp.delete({ where: { id: otp.id } });

    let user = await prisma.user.findFirst({
      where: { phone: normalized, deletedAt: null },
    });

    const INITIAL_MILEAGE = 10000;

    if (!user) {
      user = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            phone: normalized,
            name: '앱 사용자',
            mileageBalance: INITIAL_MILEAGE,
          },
        });
        // 관리대장(Customer)에도 같이 생성해 관리자에서 바로 조회/관리 가능하게 함
        await tx.customer.create({
          data: {
            registeredAt: new Date(),
            dmSend: false,
            smsSend: false,
            category: '앱회원',
            name: u.name,
            phone: normalized,
            mobile: normalized,
          },
        });
        await tx.mileageHistory.create({
          data: {
            userId: u.id,
            type: 'earn',
            amount: INITIAL_MILEAGE,
            balance: INITIAL_MILEAGE,
            description: '앱 가입 완료 보너스',
          },
        });
        return u;
      });
    }

    const payload = { userId: user.id, phone: user.phone ?? undefined };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.userRefreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.userLoginLog.create({
      data: {
        userId: user.id,
        userType: 'user',
        email: null,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? null,
      },
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          mileage: user.mileageBalance,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// ─────────────────────────────────────
// 이메일/비밀번호 인증 (기존)
// ─────────────────────────────────────

// POST /auth/register — 앱 사용자 회원가입
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ success: false, error: 'email, password, name 필수' });
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
    });
    if (existing) {
      res.status(409).json({ success: false, error: '이미 가입된 이메일입니다.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const INITIAL_MILEAGE = 10000; // 앱 다운로드 시 10,000원 적립
    const trimmedPhone = phone ? String(phone).replace(/\D/g, '').trim() : null;
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: String(email).trim().toLowerCase(),
          password: hashedPassword,
          name: String(name).trim(),
          phone: trimmedPhone,
          mileageBalance: INITIAL_MILEAGE,
        },
      });
      await tx.customer.create({
        data: {
          registeredAt: new Date(),
          dmSend: false,
          smsSend: false,
          category: '앱회원',
          name: u.name,
          phone: trimmedPhone,
          mobile: trimmedPhone,
        },
      });
      await tx.mileageHistory.create({
        data: {
          userId: u.id,
          type: 'earn',
          amount: INITIAL_MILEAGE,
          balance: INITIAL_MILEAGE,
          description: '앱 가입 완료 보너스',
        },
      });
      return u;
    });

    const payload = { userId: user.id, email: user.email ?? undefined };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.userRefreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          mileage: user.mileageBalance,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'email, password 필수' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { email: String(email).trim().toLowerCase(), deletedAt: null },
    });
    if (!user) {
      res.status(401).json({ success: false, error: '이메일 또는 비밀번호가 잘못되었습니다.' });
      return;
    }

    if (!user.password) {
      res.status(401).json({ success: false, error: '전화번호로 가입한 계정입니다. 전화번호 인증을 이용해주세요.' });
      return;
    }
    const valid = await bcrypt.compare(String(password), user.password);
    if (!valid) {
      res.status(401).json({ success: false, error: '이메일 또는 비밀번호가 잘못되었습니다.' });
      return;
    }

    const payload = { userId: user.id, email: user.email ?? undefined };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.userRefreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.userLoginLog.create({
      data: {
        userId: user.id,
        userType: 'user',
        email: user.email,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? null,
      },
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          mileage: user.mileageBalance,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: 'refreshToken 필수' });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);
    const stored = await prisma.userRefreshToken.findUnique({
      where: { token: refreshToken },
    });
    if (!stored || stored.userId !== payload.userId) {
      res.status(401).json({ success: false, error: '유효하지 않은 리프레시 토큰' });
      return;
    }
    if (stored.expiresAt < new Date()) {
      await prisma.userRefreshToken.delete({ where: { id: stored.id } });
      res.status(401).json({ success: false, error: '리프레시 토큰 만료' });
      return;
    }

    const accessToken = signAccessToken({
      userId: payload.userId!,
      email: payload.email,
      phone: payload.phone,
    });
    res.json({ success: true, data: { accessToken } });
  } catch {
    res.status(401).json({ success: false, error: '유효하지 않은 토큰' });
  }
});

// GET /auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: '인증 필요' });
    return;
  }
  try {
    const { verifyAccessToken } = await import('../utils/jwt');
    const payload = verifyAccessToken(authHeader.slice(7));
    const user = await prisma.user.findFirst({
      where: { id: payload.userId, deletedAt: null },
      select: { id: true, email: true, name: true, phone: true, mileageBalance: true },
    });
    if (!user) {
      res.status(401).json({ success: false, error: '사용자 없음' });
      return;
    }
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email ?? undefined,
        phone: user.phone ?? undefined,
        name: user.name,
        mileage: user.mileageBalance,
      },
    });
  } catch {
    res.status(401).json({ success: false, error: '유효하지 않은 토큰' });
  }
});

export default router;
