import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD for first day of month */
function monthStartYmd(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

/** First day of next month (for exclusive upper bound as YYYY-MM-DD) */
function nextMonthStartYmd(year: number, month: number): string {
  if (month === 12) return `${year + 1}-01-01`;
  return `${year}-${pad2(month + 1)}-01`;
}

// GET /admin/recommendation-kings?year=&month=&limit=
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const year = Math.min(2100, Math.max(2020, Number(req.query.year) || now.getFullYear()));
    const month = Math.min(12, Math.max(1, Number(req.query.month) || now.getMonth() + 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const dateFrom = monthStartYmd(year, month);
    const dateToExclusive = nextMonthStartYmd(year, month);
    const rangeStart = new Date(`${dateFrom}T00:00:00.000Z`);
    const rangeEnd = new Date(`${dateToExclusive}T00:00:00.000Z`);

    const [rideRows, refRows] = await Promise.all([
      prisma.$queryRaw<Array<{ userId: string; cnt: bigint }>>`
        SELECT "userId", COUNT(*)::bigint AS cnt
        FROM rides
        WHERE "userId" IS NOT NULL
          AND "date" >= ${dateFrom}
          AND "date" < ${dateToExclusive}
        GROUP BY "userId"
      `,
      prisma.$queryRaw<Array<{ referrerId: string; cnt: bigint }>>`
        SELECT "referrerId", COUNT(*)::bigint AS cnt
        FROM user_referrals
        WHERE "createdAt" >= ${rangeStart}
          AND "createdAt" < ${rangeEnd}
        GROUP BY "referrerId"
      `,
    ]);

    const rideByUser = new Map<string, number>();
    for (const r of rideRows) {
      rideByUser.set(r.userId, Number(r.cnt));
    }
    const refByUser = new Map<string, number>();
    for (const r of refRows) {
      refByUser.set(r.referrerId, Number(r.cnt));
    }

    const userIds = new Set<string>([...rideByUser.keys(), ...refByUser.keys()]);
    if (userIds.size === 0) {
      res.json({
        success: true,
        data: {
          items: [],
          year,
          month,
          limit,
        },
      });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        id: { in: [...userIds] },
        deletedAt: null,
      },
      select: { id: true, phone: true },
    });

    const rows = users
      .map((u) => {
        const rideCount = rideByUser.get(u.id) ?? 0;
        const referralCount = refByUser.get(u.id) ?? 0;
        return {
          userId: u.id,
          phone: u.phone ?? '',
          rideCount,
          callCount: rideCount,
          referralCount,
          recommendCount: referralCount,
        };
      })
      .filter((r) => r.rideCount > 0 || r.referralCount > 0);

    rows.sort((a, b) => {
      if (b.referralCount !== a.referralCount) return b.referralCount - a.referralCount;
      if (b.rideCount !== a.rideCount) return b.rideCount - a.rideCount;
      return (a.phone || '').localeCompare(b.phone || '', 'ko');
    });

    const top = rows.slice(0, limit).map((r, i) => ({
      rank: i + 1,
      phone: r.phone,
      phoneNumber: r.phone,
      callCount: r.callCount,
      rideCount: r.rideCount,
      calls: r.callCount,
      referralCount: r.referralCount,
      recommendCount: r.referralCount,
      refCount: r.referralCount,
    }));

    res.json({
      success: true,
      data: {
        items: top,
        year,
        month,
        limit,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
