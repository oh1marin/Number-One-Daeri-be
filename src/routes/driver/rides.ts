import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { applyRideCompletionMileage, resolveCompletionFareAmount } from '../../services/rideMileageOnComplete';

const router = Router();

// GET /rides — 내게 배정된 콜 목록
router.get('/', async (req, res) => {
  try {
    const driverId = req.driver!.id;
    const rides = await prisma.ride.findMany({
      where: { driverId, status: { not: 'cancelled' } },
      orderBy: [{ createdAt: 'desc' }],
    });
    res.json({ success: true, data: rides });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /rides/:id/accept — 콜 수락
router.post('/:id/accept', async (req, res) => {
  try {
    const driverId = req.driver!.id;
    const rideId = req.params.id;

    const ride = await prisma.ride.findFirst({
      where: { id: rideId, status: 'pending', driverId: null },
    });

    if (!ride) {
      res.status(404).json({ success: false, error: '대기 중인 콜이 없습니다.' });
      return;
    }

    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) return res.status(404).json({ success: false, error: 'Not found' });

    await prisma.ride.update({
      where: { id: rideId },
      data: {
        driverId,
        driverName: driver.name,
        status: 'accepted',
      },
    });

    const io = (global as unknown as { io?: { to: (r: string) => { emit: (e: string, d: object) => void } } }).io;
    if (io) {
      io.to(`ride:${rideId}`).emit('ride:accepted', {
        driverName: driver.name,
        driverPhone: driver.phone,
      });
    }

    res.json({ success: true, data: { rideId, status: 'accepted' } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /rides/:id/reject — 콜 거절
router.post('/:id/reject', async (req, res) => {
  try {
    const rideId = req.params.id;
    const ride = await prisma.ride.findFirst({
      where: { id: rideId, status: 'pending' },
    });
    if (!ride) {
      res.status(404).json({ success: false, error: '대기 중인 콜이 없습니다.' });
      return;
    }
    // 배정 전 거절 — driverId가 없으므로 단순히 다음 기사 시도 로직으로
    res.json({ success: true, data: { rideId, status: 'rejected' } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /rides/:id/arrive — 출발지 도착
router.post('/:id/arrive', async (req, res) => {
  try {
    const driverId = req.driver!.id;
    const ride = await prisma.ride.findFirst({
      where: { id: req.params.id, driverId },
    });
    if (!ride || ride.status !== 'accepted') {
      res.status(400).json({ success: false, error: '유효하지 않은 상태' });
      return;
    }

    await prisma.ride.update({
      where: { id: ride.id },
      data: { status: 'arrived' },
    });

    const io = (global as unknown as { io?: { to: (r: string) => { emit: (e: string, d: object) => void } } }).io;
    if (io) io.to(`ride:${ride.id}`).emit('ride:arrived', {});

    res.json({ success: true, data: { status: 'arrived' } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /rides/:id/start — 운행 시작 (고객 탑승)
router.post('/:id/start', async (req, res) => {
  try {
    const driverId = req.driver!.id;
    const ride = await prisma.ride.findFirst({
      where: { id: req.params.id, driverId },
    });
    if (!ride || ride.status !== 'arrived') {
      res.status(400).json({ success: false, error: '유효하지 않은 상태' });
      return;
    }

    await prisma.ride.update({
      where: { id: ride.id },
      data: { status: 'driving' },
    });

    const io = (global as unknown as { io?: { to: (r: string) => { emit: (e: string, d: object) => void } } }).io;
    if (io) io.to(`ride:${ride.id}`).emit('ride:started', {});

    res.json({ success: true, data: { status: 'driving' } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /rides/:id/complete — 운행 완료
router.post('/:id/complete', async (req, res) => {
  try {
    const driverId = req.driver!.id;
    const { fare, total } = req.body;
    const ride = await prisma.ride.findFirst({
      where: { id: req.params.id, driverId },
    });
    if (!ride || ride.status !== 'driving') {
      res.status(400).json({ success: false, error: '유효하지 않은 상태' });
      return;
    }

    const fareNum = resolveCompletionFareAmount(ride, { total, fare });

    await prisma.$transaction(async (tx) => {
      await tx.ride.update({
        where: { id: ride.id },
        data: {
          status: 'completed',
          fare: fareNum,
          total: fareNum,
        },
      });

      await applyRideCompletionMileage(
        tx,
        {
          id: ride.id,
          userId: ride.userId,
          paymentMethod: ride.paymentMethod,
        },
        fareNum
      );
    });

    const io = (global as unknown as { io?: { to: (r: string) => { emit: (e: string, d: object) => void } } }).io;
    if (io) io.to(`ride:${ride.id}`).emit('ride:completed', { total: fareNum });

    res.json({ success: true, data: { status: 'completed', total: fareNum } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
