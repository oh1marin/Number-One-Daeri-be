import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /dashboard — 건수·매출 요약, 최근 내역, 기사별 현황
router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [todayRides, todayStats, recentRides, driverStats] = await Promise.all([
      prisma.ride.findMany({
        where: { date: today },
        orderBy: { time: 'desc' },
        take: 50,
        include: {
          customer: { select: { name: true, no: true } },
          driver: { select: { name: true, no: true } },
        },
      }),
      prisma.ride.aggregate({
        where: { date: today },
        _count: { id: true },
        _sum: { total: true },
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
        today: {
          rideCount: todayStats._count.id,
          revenue: todayStats._sum.total ?? 0,
          rides: todayRides,
        },
        recent: recentRides,
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
