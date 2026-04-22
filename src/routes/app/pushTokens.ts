import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

const PLATFORMS = new Set(['android', 'ios', 'web']);

/**
 * POST /push-tokens
 * FCM 등 푸시 토큰 등록(멱등 upsert). 로그인 필수.
 * Body: { token: string, platform?: "android" | "ios" | "web" }
 *
 * 동일 token이 이미 있으면 userId·platform만 갱신(기기에서 계정 전환 시).
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { token, platform } = req.body as { token?: string; platform?: string };

    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, error: 'token 필수' });
      return;
    }
    const t = token.trim();
    if (t.length < 20 || t.length > 2048) {
      res.status(400).json({ success: false, error: 'token 길이가 올바르지 않습니다.' });
      return;
    }

    const platRaw = platform != null ? String(platform).trim().toLowerCase() : 'android';
    if (!PLATFORMS.has(platRaw)) {
      res.status(400).json({
        success: false,
        error: 'platform은 android, ios, web 중 하나여야 합니다.',
      });
      return;
    }

    await prisma.userPushToken.upsert({
      where: { token: t },
      create: {
        userId,
        token: t,
        platform: platRaw,
      },
      update: {
        userId,
        platform: platRaw,
      },
    });

    res.json({
      success: true,
      data: { saved: true, platform: platRaw },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

/**
 * DELETE /push-tokens
 * 이 기기 토큰 해제(로그아웃 등).
 * Body: { token: string }
 */
router.delete('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { token } = req.body as { token?: string };
    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, error: 'token 필수' });
      return;
    }
    const t = token.trim();
    const result = await prisma.userPushToken.deleteMany({
      where: { userId, token: t },
    });
    res.json({ success: true, data: { deleted: result.count } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
