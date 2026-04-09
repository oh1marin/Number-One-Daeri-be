import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const adminId = req.admin!.id;

    const [admin, counselors] = await Promise.all([
      prisma.admin.findUnique({ where: { id: adminId } }),
      prisma.counselor.findMany({ orderBy: { createdAt: 'desc' } }),
    ]);

    const items = [
      ...(admin
        ? [
            {
              loginId: 'admin',
              name: '관리자',
              passwordMasked: '****',
              cid: null,
              loggedIn: true,
              enabled: true,
              registeredAt: admin.createdAt.toISOString(),
              role: 'admin' as const,
            },
          ]
        : []),
      ...counselors.map((c) => ({
        loginId: c.loginId ?? c.email ?? c.id,
        name: c.name,
        passwordMasked: '****',
        cid: c.cid ?? '',
        loggedIn: false,
        enabled: c.enabled ?? true,
        registeredAt: c.createdAt.toISOString(),
        role: 'counselor' as const,
      })),
    ];

    res.json({ success: true, data: { items } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, cid, loginId, password, permissions } = req.body;

    if (!name || !loginId || !password) {
      res.status(400).json({
        success: false,
        error: 'name, loginId, password 필수',
      });
      return;
    }

    const existing = await prisma.counselor.findFirst({
      where: { loginId: String(loginId).trim() },
    });
    if (existing) {
      res.status(409).json({
        success: false,
        error: '이미 존재하는 상담원 아이디입니다.',
      });
      return;
    }

    const item = await prisma.counselor.create({
      data: {
        name: String(name).trim(),
        loginId: String(loginId).trim(),
        cid: cid ? String(cid).trim() : null,
        password: String(password),
        permissions: permissions ?? null,
        enabled: true,
      },
    });

    res.status(201).json({ success: true, data: item });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;
    const item = await prisma.counselor.update({
      where: { id: req.params.id },
      data: {
        ...(name != null && { name: String(name).trim() }),
        ...(phone != null && { phone: phone ? String(phone).trim() : null }),
        ...(email != null && { email: email ? String(email).trim() : null }),
        ...(notes != null && { notes: notes ? String(notes).trim() : null }),
      },
    });
    res.json({ success: true, data: item });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2025') res.status(404).json({ success: false, error: 'Not found' });
    else res.status(500).json({ success: false, error: String(e) });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.counselor.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { deleted: true } });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2025') res.status(404).json({ success: false, error: 'Not found' });
    else res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
