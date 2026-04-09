import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /dashboard — 건수·매출 요약, 최근 내역, 기사별 현황
// 프론트: totalCount, todayCount, totalAmount, todayAmount, recentRides, driverSummary 사용
router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [
      totalStats,
      todayStats,
      todayRides,
      recentRides,
      driverStats,
    ] = await Promise.all([
      prisma.ride.aggregate({
        _count: { id: true },
        _sum: { total: true },
      }),
      prisma.ride.aggregate({
        where: { date: today },
        _count: { id: true },
        _sum: { total: true },
      }),
      prisma.ride.findMany({
        where: { date: today },
        orderBy: { time: 'desc' },
        take: 50,
        include: {
          customer: { select: { name: true, no: true } },
          driver: { select: { name: true, no: true } },
        },
      }),
      prisma.ride.findMany({
        orderBy: [{ date: 'desc' }, { time: 'desc' }],
        take: 20,
        include: {
          customer: { select: { name: true } },
          driver: { select: { name: true } },
        },
      }),
      prisma.ride.groupBy({
        by: ['driverId', 'driverName'],
        where: { date: today },
        _count: { id: true },
        _sum: { total: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalCount: totalStats._count.id,
        todayCount: todayStats._count.id,
        totalAmount: totalStats._sum.total ?? 0,
        todayAmount: todayStats._sum.total ?? 0,
        recentRides,
        driverSummary: driverStats.map((d) => ({
          driverId: d.driverId,
          driverName: d.driverName ?? '-',
          count: d._count.id,
          amount: d._sum.total ?? 0,
        })),
        // 호환용 (기존 필드)
        today: {
          rideCount: todayStats._count.id,
          revenue: todayStats._sum.total ?? 0,
          rides: todayRides,
        },
        byDriver: driverStats.map((d) => ({
          driverId: d.driverId,
          driverName: d.driverName,
          rideCount: d._count.id,
          revenue: d._sum.total ?? 0,
        })),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
