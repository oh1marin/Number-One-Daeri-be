import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const status = req.query.status as string | undefined;
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      prisma.userInquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          messages: { orderBy: { createdAt: 'asc' } },
        },
      }),
      prisma.userInquiry.count({ where }),
    ]);
    res.json({ success: true, data: { items, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const inquiry = await prisma.userInquiry.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!inquiry) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: inquiry });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.post('/:id/reply', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'content 필수' });
    const inquiry = await prisma.userInquiry.findUnique({ where: { id: req.params.id } });
    if (!inquiry) return res.status(404).json({ success: false, error: 'Not found' });
    const msg = await prisma.userInquiryMessage.create({
      data: { inquiryId: inquiry.id, role: 'admin', content: String(content) },
    });
    await prisma.userInquiry.update({
      where: { id: inquiry.id },
      data: { status: 'active' },
    });
    res.status(201).json({ success: true, data: msg });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /admin/inquiries/:id/messages — 관리자 답장(대화형)
router.post('/:id/messages', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'content 필수' });

    const inquiry = await prisma.userInquiry.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!inquiry) return res.status(404).json({ success: false, error: 'Not found' });

    const msg = await prisma.userInquiryMessage.create({
      data: { inquiryId: inquiry.id, role: 'admin', content: String(content) },
    });

    await prisma.userInquiry.update({
      where: { id: inquiry.id },
      data: { status: 'active' },
    });

    res.status(201).json({
      success: true,
      data: {
        id: msg.id,
        content: msg.content,
        sender: 'admin',
        senderName: '상담원',
        createdAt: msg.createdAt,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
