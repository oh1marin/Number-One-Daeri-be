import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

// PATCH /me/location — 기사 위치 업데이트 (3~5초마다 호출)
router.patch('/location', async (req, res) => {
  try {
    const driverId = req.driver!.id;
    const { latitude, longitude, isOnline } = req.body;

    const lat = latitude != null ? Number(latitude) : null;
    const lng = longitude != null ? Number(longitude) : null;

    if (lat == null || lng == null) {
      res.status(400).json({ success: false, error: 'latitude, longitude 필수' });
      return;
    }

    const now = new Date();
    await prisma.driver.update({
      where: { id: driverId },
      data: {
        currentLat: lat,
        currentLng: lng,
        lastLocationAt: now,
        ...(typeof isOnline === 'boolean' && { isOnline }),
      },
    });

    // Socket으로 고객에게 위치 브로드캐스트 (index.ts의 io 전달 필요)
    const io = (global as unknown as { io?: { to: (r: string) => { emit: (e: string, d: object) => void } } }).io;
    if (io) {
      const ride = await prisma.ride.findFirst({
        where: { driverId, status: { in: ['accepted', 'driving'] } },
      });
      if (ride?.userId) {
        io.to(`ride:${ride.id}`).emit('driver:location', { lat, lng, updatedAt: now.toISOString() });
      }
    }

    res.json({ success: true, data: { lat, lng } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PATCH /me/status — 온라인/오프라인 전환
router.patch('/status', async (req, res) => {
  try {
    const driverId = req.driver!.id;
    const { isOnline } = req.body;

    if (typeof isOnline !== 'boolean') {
      res.status(400).json({ success: false, error: 'isOnline 필수 (boolean)' });
      return;
    }

    await prisma.driver.update({
      where: { id: driverId },
      data: { isOnline },
    });

    res.json({ success: true, data: { isOnline } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
