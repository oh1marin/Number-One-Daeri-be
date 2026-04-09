import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import {
  setAdminSessionCookies,
  clearAdminSessionCookies,
  ADMIN_REFRESH_COOKIE,
  getAdminRefreshTokenExpiresAt,
} from '../lib/adminSessionCookies';
import {
  allowAdminRefreshTokenInBody,
  shouldRevokeOtherSessionsOnAdminLogin,
} from '../lib/adminAuthPolicy';
import { getAdminAccessToken } from '../lib/getAdminBearerOrCookie';
import { jsonError, jsonServerError } from '../lib/jsonError';
import { rateLimitByIp } from '../middleware/rateLimit';

const router = Router();

/** 프로덕션에서는 기본 비허용. 명시적으로 ADMIN_REGISTRATION_ENABLED=true 일 때만 허용. 개발은 미설정 시 허용. */
function isAdminRegistrationAllowed(): boolean {
  const v = process.env.ADMIN_REGISTRATION_ENABLED?.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

const limitAuth = rateLimitByIp({ windowMs: 15 * 60 * 1000, max: 80, keyPrefix: 'admin-auth' });
const limitLogin = rateLimitByIp({ windowMs: 15 * 60 * 1000, max: 40, keyPrefix: 'admin-login' });
const limitRegister = rateLimitByIp({ windowMs: 15 * 60 * 1000, max: 15, keyPrefix: 'admin-reg' });

router.use(limitAuth);

// 이메일 형식 검증
function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}

// POST /auth/register — 관리자 회원가입 (공개, 운영에서는 환경 변수로 차단 가능)
router.post('/register', limitRegister, async (req, res) => {
  try {
    if (!isAdminRegistrationAllowed()) {
      jsonError(res, 403, '관리자 회원가입이 비활성화되어 있습니다.');
      return;
    }

    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      jsonError(res, 400, '이메일, 비밀번호, 이름을 모두 입력해주세요.');
      return;
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedName = String(name).trim();
    const passwordStr = String(password);

    if (!isValidEmail(trimmedEmail)) {
      jsonError(res, 400, '올바른 이메일 형식이 아닙니다.');
      return;
    }

    if (passwordStr.length < 6) {
      jsonError(res, 400, '비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (trimmedName.length < 2) {
      jsonError(res, 400, '이름은 2자 이상이어야 합니다.');
      return;
    }

    const existing = await prisma.admin.findUnique({
      where: { email: trimmedEmail },
    });
    if (existing) {
      jsonError(res, 409, '이미 가입된 이메일입니다.');
      return;
    }

    const hashedPassword = await bcrypt.hash(passwordStr, 10);
    const admin = await prisma.admin.create({
      data: {
        email: trimmedEmail,
        password: hashedPassword,
        name: trimmedName,
      },
    });

    if (shouldRevokeOtherSessionsOnAdminLogin()) {
      await prisma.refreshToken.deleteMany({ where: { adminId: admin.id } });
    }

    const payload = { adminId: admin.id, email: admin.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        adminId: admin.id,
        expiresAt: getAdminRefreshTokenExpiresAt(),
      },
    });

    setAdminSessionCookies(res, accessToken, refreshToken);
    res.status(201).json({
      success: true,
      data: {
        admin: { id: admin.id, email: admin.email, name: admin.name },
      },
    });
  } catch (e) {
    jsonServerError(res, e);
  }
});

// POST /auth/login — 로그인
router.post('/login', limitLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      jsonError(res, 400, 'email, password 필수');
      return;
    }

    const admin = await prisma.admin.findUnique({
      where: { email: String(email).trim().toLowerCase() },
    });
    if (!admin) {
      jsonError(res, 401, '이메일 또는 비밀번호가 잘못되었습니다.');
      return;
    }

    const valid = await bcrypt.compare(String(password), admin.password);
    if (!valid) {
      jsonError(res, 401, '이메일 또는 비밀번호가 잘못되었습니다.');
      return;
    }

    if (shouldRevokeOtherSessionsOnAdminLogin()) {
      await prisma.refreshToken.deleteMany({ where: { adminId: admin.id } });
    }

    const payload = { adminId: admin.id, email: admin.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        adminId: admin.id,
        expiresAt: getAdminRefreshTokenExpiresAt(),
      },
    });

    await prisma.userLoginLog.create({
      data: {
        userType: 'admin',
        email: admin.email,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? null,
      },
    });

    setAdminSessionCookies(res, accessToken, refreshToken);
    res.json({
      success: true,
      data: {
        admin: { id: admin.id, email: admin.email, name: admin.name },
      },
    });
  } catch (e) {
    jsonServerError(res, e);
  }
});

// POST /auth/logout — 쿠키 삭제 + 서버측 리프레시 토큰 무효화(세션 종료)
router.post('/logout', async (req, res) => {
  try {
    const rt = req.cookies?.[ADMIN_REFRESH_COOKIE];
    if (typeof rt === 'string' && rt.trim()) {
      await prisma.refreshToken.deleteMany({ where: { token: rt.trim() } });
    }
  } catch {
    /* 쿠키만 지워도 클라이언트 세션은 끊김 */
  }
  clearAdminSessionCookies(res);
  res.json({ success: true });
});

// POST /auth/refresh — 액세스 토큰 갱신 + 리프레시 토큰 회전(재사용 시도 완화)
router.post('/refresh', async (req, res) => {
  try {
    const cookieRt = req.cookies?.[ADMIN_REFRESH_COOKIE];
    const bodyRt = req.body?.refreshToken;
    let refreshToken = '';
    if (typeof cookieRt === 'string' && cookieRt.trim()) {
      refreshToken = cookieRt.trim();
    } else if (allowAdminRefreshTokenInBody() && typeof bodyRt === 'string' && bodyRt.trim()) {
      refreshToken = bodyRt.trim();
    }
    if (!refreshToken) {
      jsonError(res, 401, '세션이 없거나 만료되었습니다. 다시 로그인해주세요.');
      return;
    }

    const payload = verifyRefreshToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { admin: true },
    });
    if (!stored || stored.adminId !== payload.adminId) {
      jsonError(res, 401, '유효하지 않은 리프레시 토큰');
      return;
    }
    if (stored.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
      jsonError(res, 401, '리프레시 토큰 만료');
      return;
    }

    const newPayload = { adminId: payload.adminId, email: payload.email };
    const accessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: stored.id } }),
      prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          adminId: stored.adminId,
          expiresAt: getAdminRefreshTokenExpiresAt(),
        },
      }),
    ]);

    setAdminSessionCookies(res, accessToken, newRefreshToken);
    res.json({
      success: true,
      data: {},
    });
  } catch {
    jsonError(res, 401, '유효하지 않은 토큰');
  }
});

// GET /auth/me — 내 정보 (인증 필요)
router.get('/me', async (req, res) => {
  const token = getAdminAccessToken(req);
  if (!token) {
    jsonError(res, 401, '인증 필요');
    return;
  }
  try {
    const { verifyAccessToken } = await import('../utils/jwt');
    const payload = verifyAccessToken(token);
    const admin = await prisma.admin.findUnique({
      where: { id: payload.adminId },
      select: { id: true, email: true, name: true },
    });
    if (!admin) {
      jsonError(res, 401, '사용자 없음');
      return;
    }
    res.json({ success: true, data: admin });
  } catch {
    jsonError(res, 401, '유효하지 않은 토큰');
  }
});

export default router;
