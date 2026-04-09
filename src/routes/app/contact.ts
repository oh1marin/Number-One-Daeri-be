import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { sendContactEmail, verifySmtp } from '../../lib/email';

const router = Router();

// GET /contact/test — SMTP 연결 테스트 (개발용)
router.get('/test', async (_req, res) => {
  const verify = await verifySmtp();
  if (!verify.ok) {
    res.status(500).json({
      success: false,
      error: verify.error,
      hint: 'SMTP_HOST, SMTP_USER, SMTP_PASS 확인. Gmail은 앱비밀번호 사용.',
    });
    return;
  }
  const send = await sendContactEmail({
    name: '테스트',
    email: 'test@test.com',
    content: '이메일 발송 테스트입니다.',
  });
  if (!send.ok) {
    res.status(500).json({
      success: false,
      error: send.error,
      hint: 'CONTACT_EMAIL 또는 SMTP_USER 확인',
    });
    return;
  }
  res.json({ success: true, message: '테스트 이메일 발송됨' });
});

// POST /contact — 공개 상담문의 (비로그인)
router.post('/', async (req, res) => {
  try {
    const { name, email, content, phone } = req.body;

    if (!content) {
      res.status(400).json({ success: false, error: 'content 필수' });
      return;
    }

    const contact = await prisma.contact.create({
      data: {
        name: String(name || '비공개'),
        email: String(email || ''),
        phone: phone ? String(phone) : null,
        content: String(content),
      },
    });

    const send = await sendContactEmail({
      name: contact.name,
      email: contact.email,
      phone: contact.phone ?? undefined,
      content: contact.content,
    });

    if (!send.ok) {
      console.warn('이메일 미발송:', send.error);
    }

    res.status(201).json({
      success: true,
      data: { id: contact.id, message: '접수되었습니다.' },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
