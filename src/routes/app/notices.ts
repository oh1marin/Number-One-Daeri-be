/**
 * 공개 공지 API — 인증 불필요.
 * 마운트 경로: `GET /api/v1/notices` (routes/index → app) 및 `GET /notices` (app.ts 루트).
 * 응답: `{ success, data: { items, total } }` (목록), `{ success, data }` (단건).
 */
import { Router } from 'express';
import { prisma } from '../../lib/prisma';

type NoticeRow = { id: string; title: string; content: string; createdAt: Date; badge?: string | null; badgeColor?: string | null; views: number; events?: unknown };

/** 공지 응답 포맷 (웹·앱 공용) */
function formatNotice(n: NoticeRow) {
  const date = n.createdAt.toISOString().slice(0, 10).replace(/-/g, '.');
  const events = (Array.isArray(n.events) ? n.events : []) as Array<{ title?: string; date?: string; desc?: string }>;
  return {
    id: n.id,
    badge: n.badge ?? '공지',
    badgeColor: n.badgeColor ?? 'bg-red-100 text-red-600',
    title: n.title,
    date,
    views: n.views ?? 0,
    content: n.content,
    events: events.length ? events : [{ title: '', date: '', desc: '' }],
  };
}

const router = Router();

// GET /notices/latest — 홈용 최신 1건
router.get('/latest', async (_req, res) => {
  try {
    const notice = await prisma.notice.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!notice) return res.json({ success: true, data: null });
    res.json({ success: true, data: formatNotice(notice) });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /notices — 공지 목록 (웹·앱 공용, 인증 불필요)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.notice.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notice.count(),
    ]);

    const items = rows.map(formatNotice);
    res.json({ success: true, data: { items, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /notices/:id — 공지 상세 (조회 시 views 증가)
router.get('/:id', async (req, res) => {
  try {
    const notice = await prisma.notice.findUnique({
      where: { id: req.params.id },
    });
    if (!notice) return res.status(404).json({ success: false, error: 'Not found' });

    await prisma.notice.update({
      where: { id: req.params.id },
      data: { views: { increment: 1 } },
    });

    res.json({ success: true, data: formatNotice({ ...notice, views: notice.views + 1 }) });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
