import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

async function getOrCreateUsageGuide() {
  let guide = await prisma.usageGuide.findFirst();
  if (!guide) {
    guide = await prisma.usageGuide.create({
      data: { title: '사용설명', content: '' },
    });
  }
  return guide;
}

// GET /admin/usage-guide
router.get('/', async (_req, res) => {
  try {
    const guide = await getOrCreateUsageGuide();
    res.json({ success: true, data: { title: guide.title, content: guide.content } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /admin/usage-guide
router.put('/', async (req, res) => {
  try {
    const { title, content } = req.body;
    const existing = await getOrCreateUsageGuide();
    const updated = await prisma.usageGuide.update({
      where: { id: existing.id },
      data: {
        ...(title != null && { title: String(title) }),
        ...(content != null && { content: String(content) }),
      },
    });
    res.json({ success: true, data: { title: updated.title, content: updated.content } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
