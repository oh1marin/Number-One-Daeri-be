import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { formatNotice } from '../../lib/noticeFormat';

const router = Router();

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
    const { title, content, badge, badgeColor, views, events, coverImageUrl } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, error: 'title 필수' });
    }
    const notice = await prisma.notice.create({
      data: {
        title: String(title).trim(),
        content: content != null ? String(content) : '',
        ...(badge != null && { badge: String(badge) }),
        ...(badgeColor != null && { badgeColor: String(badgeColor) }),
        ...(views != null && { views: Number(views) }),
        ...(events != null && { events }),
        ...(coverImageUrl != null && {
          coverImageUrl: String(coverImageUrl).trim() || null,
        }),
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
    const { title, content, badge, badgeColor, views, events, coverImageUrl } = req.body;
    const notice = await prisma.notice.update({
      where: { id: req.params.id },
      data: {
        ...(title != null && { title: String(title) }),
        ...(content != null && { content: String(content) }),
        ...(badge != null && { badge: String(badge) }),
        ...(badgeColor != null && { badgeColor: String(badgeColor) }),
        ...(views != null && { views: Number(views) }),
        ...(events !== undefined && { events }),
        ...(coverImageUrl !== undefined && {
          coverImageUrl: coverImageUrl ? String(coverImageUrl).trim() : null,
        }),
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
