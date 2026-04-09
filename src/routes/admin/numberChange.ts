import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

function normalizePhone(s: string): string {
  return String(s).replace(/\D/g, '').trim();
}

// POST /admin/number-change/lookup — 전화번호 배열로 바뀐 번호 조회 (엑셀 업로드 시 FE에서 번호 추출 후 호출)
// Body: { phones: ["01012345678", "010-1234-5678", ...] }
// Response: [{ phoneBefore, phoneAfter, found }] — found=true면 바뀐 번호 있음
router.post('/lookup', async (req, res) => {
  try {
    const { phones } = req.body;
    if (!Array.isArray(phones) || phones.length === 0) {
      res.status(400).json({ success: false, error: 'phones 배열 필수 (최소 1개)' });
      return;
    }
    const normalizedList = [...new Set(phones.map((p: unknown) => normalizePhone(String(p ?? ''))))].filter(
      (p) => p.length >= 10
    );

    if (normalizedList.length === 0) {
      res.status(400).json({ success: false, error: '유효한 전화번호(10자리 이상)가 없습니다.' });
      return;
    }

    const records = await prisma.numberChange.findMany({
      where: { phoneBefore: { in: normalizedList } },
      select: { phoneBefore: true, phoneAfter: true },
    });
    const map = new Map(records.map((r) => [r.phoneBefore, r.phoneAfter]));

    const items = normalizedList.map((phone) => ({
      phoneBefore: phone,
      phoneAfter: map.get(phone) ?? null,
      found: map.has(phone),
    }));

    res.json({
      success: true,
      data: {
        items,
        total: items.length,
        foundCount: items.filter((i) => i.found).length,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /admin/number-change — 목록 (phoneBefore, phoneAfter)
router.get('/', async (_req, res) => {
  try {
    const rows = await prisma.numberChange.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, phoneBefore: true, phoneAfter: true, createdAt: true },
    });
    const items = rows.map((r) => ({
      id: r.id,
      phoneBefore: r.phoneBefore,
      phoneAfter: r.phoneAfter,
      phone_before: r.phoneBefore,
      phone_after: r.phoneAfter,
      createdAt: r.createdAt,
    }));
    res.json({ success: true, data: { items, total: items.length } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /admin/number-change — 자료등록 (단건 또는 배열)
// body: { phoneBefore, phoneAfter } 또는 { items: [ { phoneBefore, phoneAfter }, ... ] }
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    let toCreate: { phoneBefore: string; phoneAfter: string }[] = [];

    if (Array.isArray(body.items) && body.items.length > 0) {
      toCreate = body.items
        .filter((x: unknown) => x && typeof x === 'object' && 'phoneBefore' in (x as object))
        .map((x: { phoneBefore?: string; phoneAfter?: string }) => ({
          phoneBefore: normalizePhone(String((x as { phoneBefore?: string }).phoneBefore ?? '')),
          phoneAfter: normalizePhone(String((x as { phoneAfter?: string }).phoneAfter ?? '')),
        }))
        .filter((x: { phoneBefore: string; phoneAfter: string }) => x.phoneBefore.length >= 10 && x.phoneAfter.length >= 10);
    } else if (body.phoneBefore != null && body.phoneAfter != null) {
      const before = normalizePhone(String(body.phoneBefore));
      const after = normalizePhone(String(body.phoneAfter));
      if (before.length >= 10 && after.length >= 10) toCreate = [{ phoneBefore: before, phoneAfter: after }];
    }

    if (toCreate.length === 0) {
      res.status(400).json({ success: false, error: 'phoneBefore, phoneAfter 필수(10자리 이상) 또는 items 배열' });
      return;
    }

    const created = await prisma.numberChange.createMany({
      data: toCreate,
      skipDuplicates: false,
    });
    res.status(201).json({ success: true, data: { created: created.count } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PATCH /admin/number-change/:id — 수정
router.patch('/:id', async (req, res) => {
  try {
    const { phoneBefore, phoneAfter } = req.body;
    const data: { phoneBefore?: string; phoneAfter?: string } = {};
    if (phoneBefore != null) data.phoneBefore = normalizePhone(String(phoneBefore));
    if (phoneAfter != null) data.phoneAfter = normalizePhone(String(phoneAfter));
    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, error: 'phoneBefore 또는 phoneAfter 필요' });
      return;
    }
    const updated = await prisma.numberChange.update({
      where: { id: req.params.id },
      data,
    });
    res.json({
      success: true,
      data: {
        id: updated.id,
        phoneBefore: updated.phoneBefore,
        phoneAfter: updated.phoneAfter,
        phone_before: updated.phoneBefore,
        phone_after: updated.phoneAfter,
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2025') res.status(404).json({ success: false, error: 'Not found' });
    else res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /admin/number-change/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.numberChange.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2025') res.status(404).json({ success: false, error: 'Not found' });
    else res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
