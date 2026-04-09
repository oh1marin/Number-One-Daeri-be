import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const router = Router();

function buildListHandler() {
  return async (req: import('express').Request, res: import('express').Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
      const search = (req.query.search ?? req.query.q) as string | undefined;
      const filter = req.query.filter as string | undefined; // 확장용: category, etc.
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = { deletedAt: null };
      if (search && String(search).trim()) {
        const q = String(search).trim();
        where.OR = [
          { name: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q, mode: 'insensitive' as const } },
        ];
      }
      // filter 예: filter=app (앱 회원만). 추후 확장 가능
      if (filter === 'app' || filter === 'user') {
        // User 모델이 앱 회원이므로 별도 필터 없음 (고객/앱 구분 시 확장)
      }

      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            no: true,
            email: true,
            name: true,
            phone: true,
            mileageBalance: true,
            settings: true,
            createdAt: true,
            referralAsReferred: { select: { referrerId: true } },
            _count: {
              select: { referralAsReferrer: true, rides: true },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      const userIds = rows.map((r) => r.id);
      const referrer2CountMap: Record<string, number> = {};
      if (userIds.length > 0) {
        const ref2 = await prisma.$queryRaw<{ referrer_id: string; cnt: bigint }[]>`
          SELECT ur."referrerId" as referrer_id, COUNT(ur2.id)::bigint as cnt
          FROM user_referrals ur
          JOIN user_referrals ur2 ON ur2."referrerId" = ur."referredId"
          WHERE ur."referrerId" IN (${Prisma.join(userIds)})
          GROUP BY ur."referrerId"
        `;
        for (const r of ref2) referrer2CountMap[r.referrer_id] = Number(r.cnt);
      }

      const items = rows.map((u) => {
        const settings = (u.settings as Record<string, unknown>) ?? {};
        return {
        id: u.id,
        no: u.no,
        email: u.email ?? '',
        name: u.name,
        phone: u.phone ?? '',
        mileageBalance: u.mileageBalance,
        smsOptOut: Boolean(settings.smsOptOut),
        createdAt: u.createdAt,
        referrerId: u.referralAsReferred?.referrerId ?? null,
        referrer1Count: u._count.referralAsReferrer,
        referrer2Count: referrer2CountMap[u.id] ?? 0,
        installed: true, // 앱 회원 가입 = 설치
        performance: null as number | null, // 추후 지표 정의 시 채움
        rideCount: u._count.rides,
        category: '앱' as string,
      };
      });

      res.json({ success: true, data: { items, total } });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  };
}

// GET /admin/users — 앱 회원 목록 (page, limit, search, filter 지원)
router.get('/', buildListHandler());

// PATCH /admin/users/bulk — 일괄 수정 { ids: [], referrerId?, phone? }
router.patch('/bulk', async (req, res) => {
  try {
    const { ids, referrerId, phone } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: 'ids 배열 필수' });
      return;
    }
    if (referrerId === undefined && phone === undefined) {
      res.status(400).json({ success: false, error: 'referrerId 또는 phone 중 하나 필수' });
      return;
    }
    const userIds = ids.filter((x: unknown) => typeof x === 'string') as string[];

    if (referrerId !== undefined) {
      await prisma.userReferral.deleteMany({ where: { referredId: { in: userIds } } });
      if (referrerId) {
        const refId = String(referrerId).trim();
        await prisma.userReferral.createMany({
          data: userIds.map((referredId) => ({ referrerId: refId, referredId })),
          skipDuplicates: true,
        });
      }
    }
    if (phone !== undefined) {
      const phoneVal = phone ? String(phone).replace(/\D/g, '').trim() || null : null;
      if (phoneVal !== null && userIds.length === 1) {
        await prisma.user.updateMany({
          where: { id: { in: userIds }, deletedAt: null },
          data: { phone: phoneVal },
        });
      } else if (phoneVal !== null && userIds.length > 1) {
        res.status(400).json({ success: false, error: '전화번호 수정은 1명씩만 가능합니다.' });
        return;
      }
    }
    res.json({ success: true, data: { updated: userIds.length } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /admin/users/lookup?phone=010... — 전화번호로 앱회원 userId 조회
router.get('/lookup', async (req, res) => {
  try {
    const phoneRaw = req.query.phone;
    const phoneVal = phoneRaw != null ? String(phoneRaw).replace(/\D/g, '').trim() : '';

    // 너무 짧은 값은 조회 의미가 없어서 방어
    if (!phoneVal || phoneVal.length < 10) {
      res.status(400).json({ success: false, error: 'phone(10자리 이상) 필수' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { phone: phoneVal, deletedAt: null },
      select: { id: true, phone: true, name: true },
    });

    res.json({
      success: true,
      data: {
        found: Boolean(user),
        userIds: user ? [user.id] : [],
        user: user ?? null,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PATCH /admin/users/:id — 수신거부 등 { smsOptOut: true }
router.patch('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: { id: true, settings: true },
    });
    if (!user) return res.status(404).json({ success: false, error: 'Not found' });
    const { smsOptOut } = req.body;
    const current = (user.settings as Record<string, unknown>) ?? {};
    const settings = { ...current, ...(smsOptOut !== undefined && { smsOptOut: Boolean(smsOptOut) }) };
    await prisma.user.update({
      where: { id: req.params.id },
      data: { settings },
    });
    res.json({ success: true, data: { smsOptOut: Boolean(settings.smsOptOut) } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: {
        id: true,
        no: true,
        email: true,
        name: true,
        phone: true,
        mileageBalance: true,
        settings: true,
        createdAt: true,
        referralAsReferred: { select: { referrerId: true } },
        _count: { select: { referralAsReferrer: true, rides: true } },
      },
    });
    if (!user) return res.status(404).json({ success: false, error: 'Not found' });
    const settings = (user.settings as Record<string, unknown>) ?? {};

    const ref2 = await prisma.$queryRaw<{ referrer_id: string; cnt: bigint }[]>`
      SELECT ur."referrerId" as referrer_id, COUNT(ur2.id)::bigint as cnt
      FROM user_referrals ur
      JOIN user_referrals ur2 ON ur2."referrerId" = ur."referredId"
      WHERE ur."referrerId" = ${user.id}
      GROUP BY ur."referrerId"
    `;
    const referrer2Count = ref2[0] ? Number(ref2[0].cnt) : 0;

    const { referralAsReferred, _count, settings: _, ...rest } = user;
    res.json({
      success: true,
      data: {
        ...rest,
        email: user.email ?? '',
        phone: user.phone ?? '',
        smsOptOut: Boolean(settings.smsOptOut),
        referrerId: referralAsReferred?.referrerId ?? null,
        referrer1Count: _count.referralAsReferrer,
        referrer2Count,
        installed: true,
        performance: null,
        rideCount: _count.rides,
        category: '앱',
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export { buildListHandler };
export default router;
