import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const items = await prisma.faq.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, data: items });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const faq = await prisma.faq.findUnique({ where: { id: req.params.id } });
    if (!faq) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: faq });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.post('/', async (req, res) => {
  try {
    const { question, answer, sortOrder } = req.body;
    if (!question || !answer) return res.status(400).json({ success: false, error: 'question, answer 필수' });
    const faq = await prisma.faq.create({
      data: { question: String(question), answer: String(answer), sortOrder: Number(sortOrder) || 0 },
    });
    res.status(201).json({ success: true, data: faq });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { question, answer, sortOrder } = req.body;
    const faq = await prisma.faq.update({
      where: { id: req.params.id },
      data: {
        ...(question != null && { question: String(question) }),
        ...(answer != null && { answer: String(answer) }),
        ...(sortOrder != null && { sortOrder: Number(sortOrder) }),
      },
    });
    res.json({ success: true, data: faq });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.faq.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
