import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

type MonthlyRow = { y: number; m: number; cnt: bigint };

// GET /admin/order-stats?year=2026
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const year = Math.min(2100, Math.max(2020, Number(req.query.year) || now.getFullYear()));
    const prevYear = year - 1;

    const [
      currentYearMonthly,
      prevYearMonthly,
      currentYearTotalRows,
      prevYearTotalRows,
    ] = await Promise.all([
      prisma.$queryRaw<MonthlyRow[]>`
        SELECT SUBSTRING("date", 1, 4)::int as y, SUBSTRING("date", 6, 2)::int as m, COUNT(*)::bigint as cnt
        FROM rides
        WHERE "userId" IS NOT NULL AND SUBSTRING("date", 1, 4) = ${String(year)}
        GROUP BY SUBSTRING("date", 1, 4), SUBSTRING("date", 6, 2)
        ORDER BY m
      `,
      prisma.$queryRaw<MonthlyRow[]>`
        SELECT SUBSTRING("date", 1, 4)::int as y, SUBSTRING("date", 6, 2)::int as m, COUNT(*)::bigint as cnt
        FROM rides
        WHERE "userId" IS NOT NULL AND SUBSTRING("date", 1, 4) = ${String(prevYear)}
        GROUP BY SUBSTRING("date", 1, 4), SUBSTRING("date", 6, 2)
        ORDER BY m
      `,
      prisma.ride.count({
        where: {
          userId: { not: null },
          date: { startsWith: String(year) },
        },
      }),
      prisma.ride.count({
        where: {
          userId: { not: null },
          date: { startsWith: String(prevYear) },
        },
      }),
    ]);

    // Ride.date는 YYYY-MM-DD 문자열 → 월별 집계
    const byYearMonth: Record<number, number> = {};
    for (const r of currentYearMonthly) {
      byYearMonth[r.m] = (byYearMonth[r.m] ?? 0) + Number(r.cnt);
    }

    const prevByYearMonth: Record<number, number> = {};
    for (const r of prevYearMonthly) {
      prevByYearMonth[r.m] = (prevByYearMonth[r.m] ?? 0) + Number(r.cnt);
    }

    const currentYearTotal = currentYearTotalRows;
    const prevYearTotal = prevYearTotalRows;

    const dataMonths = Object.keys(byYearMonth).length;
    const aggregatingMonths = now.getFullYear() === year ? Math.min(now.getMonth() + 1, 12) - dataMonths : 0;
    const dataMonthsForAvg = dataMonths || 1;
    const currentYearMonthlyAvg = Math.round((currentYearTotal / dataMonthsForAvg) * 10) / 10;

    let currentYearMax = 0;
    let currentYearMaxMonth = 0;
    for (let m = 1; m <= 12; m++) {
      const v = byYearMonth[m] ?? 0;
      if (v > currentYearMax) {
        currentYearMax = v;
        currentYearMaxMonth = m;
      }
    }

    const prevYearDataMonths = Math.max(1, Object.keys(prevByYearMonth).length);
    const prevYearMonthlyAvg =
      prevYear < now.getFullYear()
        ? Math.round((prevYearTotal / 12) * 10) / 10
        : Math.round((prevYearTotal / prevYearDataMonths) * 10) / 10;

    const yearOverYearChange =
      prevYearTotal > 0
        ? Math.round(((currentYearTotal - prevYearTotal) / prevYearTotal) * 1000) / 10
        : currentYearTotal > 0 ? 100 : 0;

    const monthlyAvgChange =
      prevYearMonthlyAvg > 0
        ? Math.round(((currentYearMonthlyAvg - prevYearMonthlyAvg) / prevYearMonthlyAvg) * 1000) / 10
        : currentYearMonthlyAvg > 0 ? 100 : 0;

    const yearData: Record<string, { total: number; monthly: Record<number, number> }> = {
      [String(year)]: { total: currentYearTotal, monthly: byYearMonth },
      [String(prevYear)]: { total: prevYearTotal, monthly: prevByYearMonth },
    };

    const data: Record<string, unknown> = {
      currentYearTotal,
      currentYearMax,
      currentYearMaxMonth,
      currentYearMonthlyAvg,
      dataMonths,
      aggregatingMonths: Math.max(0, aggregatingMonths),
      yearOverYearChange,
      monthlyAvgChange,
      yearData,
    };

    // ?debug=1 → userId별 건수 분포 (비정상적으로 많은 userId 확인용)
    if (req.query.debug === '1') {
      const byUser = await prisma.$queryRaw<{ user_id: string; cnt: bigint }[]>`
        SELECT "userId" as user_id, COUNT(*)::bigint as cnt
        FROM rides
        WHERE "userId" IS NOT NULL
        GROUP BY "userId"
        ORDER BY cnt DESC
        LIMIT 20
      `;
      const totalWithUserId = await prisma.ride.count({
        where: { userId: { not: null } },
      });
      data._debug = {
        totalRidesWithUserId: totalWithUserId,
        topUsersByRideCount: byUser.map((r) => ({ userId: r.user_id, count: Number(r.cnt) })),
      };
    }

    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
