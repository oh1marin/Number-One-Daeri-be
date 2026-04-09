import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

type MonthlyRow = { y: number; m: number; cnt: bigint };

// GET /admin/app-install-stats?year=2026&month=3
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const year = Math.min(2100, Math.max(2020, Number(req.query.year) || now.getFullYear()));
    const month = req.query.month ? Math.min(12, Math.max(1, Number(req.query.month))) : null;

    const prevYear = year - 1;

    // 이번달 설치 (선택한 year/month, 없으면 현재 월)
    const targetYear = month ? year : now.getFullYear();
    const targetMonth = month ?? now.getMonth() + 1;
    const monthStart = new Date(targetYear, targetMonth - 1, 1);
    const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();

    const [
      thisMonthInstall,
      annualInstallRows,
      prevYearInstallRows,
      annualCallsRows,
      prevYearCallsRows,
      monthlyInstallRows,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.$queryRaw<MonthlyRow[]>`
        SELECT EXTRACT(YEAR FROM "createdAt")::int as y, EXTRACT(MONTH FROM "createdAt")::int as m, COUNT(*)::bigint as cnt
        FROM users
        WHERE EXTRACT(YEAR FROM "createdAt") = ${year}
        GROUP BY y, m
        ORDER BY m
      `,
      prisma.$queryRaw<MonthlyRow[]>`
        SELECT EXTRACT(YEAR FROM "createdAt")::int as y, EXTRACT(MONTH FROM "createdAt")::int as m, COUNT(*)::bigint as cnt
        FROM users
        WHERE EXTRACT(YEAR FROM "createdAt") = ${prevYear}
        GROUP BY y, m
        ORDER BY m
      `,
      prisma.$queryRaw<{ cnt: bigint }[]>`
        SELECT COUNT(*)::bigint as cnt
        FROM rides
        WHERE "userId" IS NOT NULL
          AND SUBSTRING("date", 1, 4) = ${String(year)}
      `,
      prisma.$queryRaw<{ cnt: bigint }[]>`
        SELECT COUNT(*)::bigint as cnt
        FROM rides
        WHERE "userId" IS NOT NULL
          AND SUBSTRING("date", 1, 4) = ${String(prevYear)}
      `,
      prisma.$queryRaw<MonthlyRow[]>`
        SELECT EXTRACT(YEAR FROM "createdAt")::int as y, EXTRACT(MONTH FROM "createdAt")::int as m, COUNT(*)::bigint as cnt
        FROM users
        WHERE EXTRACT(YEAR FROM "createdAt") IN (${year}, ${prevYear})
        GROUP BY y, m
        ORDER BY y, m
      `,
    ]);

    const annualTotalInstall = annualInstallRows.reduce((s, r) => s + Number(r.cnt), 0);
    const prevYearInstall = prevYearInstallRows.reduce((s, r) => s + Number(r.cnt), 0);
    const annualTotalCalls = annualCallsRows[0] ? Number(annualCallsRows[0].cnt) : 0;
    const prevYearCalls = prevYearCallsRows[0] ? Number(prevYearCallsRows[0].cnt) : 0;

    const byYearMonth: Record<string, Record<number, number>> = {};
    for (const r of monthlyInstallRows) {
      const k = String(r.y);
      if (!byYearMonth[k]) byYearMonth[k] = {};
      byYearMonth[k][r.m] = Number(r.cnt);
    }

    let maxInstall = 0;
    let maxInstallMonth = '';
    for (const r of annualInstallRows) {
      const n = Number(r.cnt);
      if (n > maxInstall) {
        maxInstall = n;
        maxInstallMonth = `${r.m}월`;
      }
    }

    const monthsWithData = annualInstallRows.length || 1;
    const monthlyAvgInstall = Math.round((annualTotalInstall / monthsWithData) * 10) / 10;
    const monthlyAvgBaseMonths = monthsWithData;

    const chartData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ({
      month: `${String(m).padStart(2, '0')}월`,
      [String(year) + '년']: byYearMonth[String(year)]?.[m] ?? 0,
      [String(prevYear) + '년']: byYearMonth[String(prevYear)]?.[m] ?? 0,
    }));

    res.json({
      success: true,
      data: {
        thisMonthInstall,
        thisMonthDailyAvg: daysInMonth > 0 ? Math.round((thisMonthInstall / daysInMonth) * 10) / 10 : 0,
        annualTotalInstall,
        annualTotalCalls,
        prevYearInstall,
        prevYearCalls,
        maxInstall,
        maxInstallMonth: maxInstallMonth || '-',
        monthlyAvgInstall,
        monthlyAvgBaseMonths,
        chartData,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
