import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { sendContactEmail } from '../../lib/email';
import { sendSms } from '../../lib/sms';

const router = Router();

// POST /inquiries
router.post('/', async (req, res) => {
  try {
    const userId = req.user!.id;

    const content = req.body?.content;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    const inquiry = await prisma.userInquiry.create({
      data: { userId, status: 'active' },
    });

    if (content != null && String(content).trim()) {
      await prisma.userInquiryMessage.create({
        data: {
          inquiryId: inquiry.id,
          role: 'user',
          content: String(content),
        },
      });

      if (user && (user.email || user.phone)) {
        const send = await sendContactEmail({
          name: user.name,
          email: user.email ?? user.phone ?? '미등록',
          phone: user.phone ?? undefined,
          content: String(content),
        });
        if (!send.ok) console.warn('이메일 미발송:', send.error);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        id: inquiry.id,
        status: inquiry.status,
        createdAt: inquiry.createdAt,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /inquiries/my/active
router.get('/my/active', async (req, res) => {
  try {
    const userId = req.user!.id;
    const inquiry = await prisma.userInquiry.findFirst({
      where: { userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    if (!inquiry) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    res.json({ success: true, data: { id: inquiry.id, status: inquiry.status, createdAt: inquiry.createdAt } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /inquiries
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const inquiries = await prisma.userInquiry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    const items = inquiries.map((q) => {
      const first = q.messages[0];
      return {
        id: q.id,
        content: first?.content,
        reply: q.messages.find((m) => m.role === 'admin')?.content,
        status: q.status,
        createdAt: q.createdAt,
      };
    });

    res.json({ success: true, data: { items } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /inquiries/:id/messages
router.get('/:id/messages', async (req, res) => {
  try {
    const userId = req.user!.id;

    const inquiry = await prisma.userInquiry.findFirst({
      where: { id: req.params.id, userId },
      include: { user: { select: { name: true } } },
    });
    if (!inquiry) return res.status(404).json({ success: false, error: 'Not found' });

    const afterRaw = req.query.after;
    const afterId = typeof afterRaw === 'string' && afterRaw.trim() ? afterRaw.trim() : '';

    let messages;
    if (afterId) {
      const afterMsg = await prisma.userInquiryMessage.findFirst({
        where: { id: afterId, inquiryId: req.params.id },
        select: { createdAt: true },
      });
      const afterCreatedAt = afterMsg?.createdAt;
      messages = afterCreatedAt
        ? await prisma.userInquiryMessage.findMany({
            where: { inquiryId: req.params.id, createdAt: { gt: afterCreatedAt } },
            orderBy: { createdAt: 'asc' },
          })
        : [];
    } else {
      messages = await prisma.userInquiryMessage.findMany({
        where: { inquiryId: req.params.id },
        orderBy: { createdAt: 'asc' },
      });
    }

    const senderNameForUser = inquiry.user?.name ?? '고객';

    res.json({
      success: true,
      data: {
        messages: messages.map((m) => ({
          id: m.id,
          content: m.content,
          sender: m.role === 'admin' ? 'admin' : 'user',
          senderName: m.role === 'admin' ? '상담원' : senderNameForUser,
          createdAt: m.createdAt,
        })),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /inquiries/:id/messages
router.post('/:id/messages', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ success: false, error: 'content 필수' });
      return;
    }

    const inquiry = await prisma.userInquiry.findFirst({
      where: { id: req.params.id, userId },
      include: { user: { select: { name: true } } },
    });
    if (!inquiry) return res.status(404).json({ success: false, error: 'Not found' });

    const msg = await prisma.userInquiryMessage.create({
      data: {
        inquiryId: inquiry.id,
        role: 'user',
        content: String(content),
      },
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
        sender: 'user',
        senderName: inquiry.user?.name ?? '고객',
        createdAt: msg.createdAt,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /inquiries/:id/escalate-sms — 상담원 연결을 SMS로 요청
// (QA 화면에서 "문자 원해요" 선택 시 사용)
router.post('/:id/escalate-sms', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { message } = req.body ?? {};
    const inquiry = await prisma.userInquiry.findFirst({
      where: { id: req.params.id, userId },
      include: { user: { select: { id: true, name: true, phone: true } } },
    });
    if (!inquiry) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    const phone = inquiry.user.phone;
    if (!phone) {
      res.status(400).json({ success: false, error: '등록된 전화번호가 없습니다.' });
      return;
    }

    const smsText =
      String(message ?? '').trim() ||
      '상담요청이 접수되었습니다. 담당 상담원이 순차적으로 연락드리겠습니다.';

    const ok = await sendSms(phone, smsText);

    // 채팅 히스토리에도 남겨주기(사용자가 “문자 요청됨”을 확인)
    await prisma.userInquiryMessage.create({
      data: {
        inquiryId: inquiry.id,
        role: 'admin',
        content: `SMS로 상담 연결 요청: ${smsText}`,
      },
    });

    await prisma.userInquiry.update({
      where: { id: inquiry.id },
      data: { status: 'active' },
    });

    res.status(201).json({
      success: true,
      data: { sent: ok ? 1 : 0 },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
