import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

/** 공지 응답 포맷 */
function formatNotice(n: { id: string; title: string; content: string; createdAt: Date; badge?: string | null; badgeColor?: string | null; views: number; events?: unknown }) {
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

// GET /admin/notices
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.notice.findMany({ orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.notice.count(),
    ]);
    const items = rows.map(formatNotice);
    res.json({ success: true, data: { items, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /admin/notices/:id
router.get('/:id', async (req, res) => {
  try {
    const notice = await prisma.notice.findUnique({ where: { id: req.params.id } });
    if (!notice) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: formatNotice(notice) });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /admin/notices
router.post('/', async (req, res) => {
  try {
    const { title, content, badge, badgeColor, views, events } = req.body;
    if (!title || !content) return res.status(400).json({ success: false, error: 'title, content 필수' });
    const notice = await prisma.notice.create({
      data: {
        title: String(title),
        content: String(content),
        ...(badge != null && { badge: String(badge) }),
        ...(badgeColor != null && { badgeColor: String(badgeColor) }),
        ...(views != null && { views: Number(views) }),
        ...(events != null && { events: events }),
      },
    });
    res.status(201).json({ success: true, data: formatNotice(notice) });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /admin/notices/:id
router.put('/:id', async (req, res) => {
  try {
    const { title, content, badge, badgeColor, views, events } = req.body;
    const notice = await prisma.notice.update({
      where: { id: req.params.id },
      data: {
        ...(title != null && { title: String(title) }),
        ...(content != null && { content: String(content) }),
        ...(badge != null && { badge: String(badge) }),
        ...(badgeColor != null && { badgeColor: String(badgeColor) }),
        ...(views != null && { views: Number(views) }),
        ...(events !== undefined && { events }),
      },
    });
    res.json({ success: true, data: formatNotice(notice) });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /admin/notices/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.notice.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
