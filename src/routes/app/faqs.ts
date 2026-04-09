import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

// GET /faqs — 자주하는질문 (공개)
router.get('/', async (_req, res) => {
  try {
    const items = await prisma.faq.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, question: true, answer: true },
    });
    res.json({ success: true, data: { items } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
