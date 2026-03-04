import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /rides — 목록 (쿼리: ?date=2026-03-04, ?driverName=홍기사, ?field=phone&q=010)
router.get('/', async (req, res) => {
  try {
    const { date, driverName, field, q } = req.query;
    const where: Record<string, unknown> = {};

    if (typeof date === 'string' && date) where.date = date;
    if (typeof driverName === 'string' && driverName) {
      where.driverName = { contains: driverName, mode: 'insensitive' };
    }
    if (field && typeof q === 'string' && q) {
      const fieldStr = String(field);
      if (['customerName', 'phone', 'pickup', 'dropoff'].includes(fieldStr)) {
        (where as Record<string, object>)[fieldStr] = {
          contains: q,
          mode: 'insensitive',
        };
      }
    }

    const rides = await prisma.ride.findMany({
      where,
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
      include: {
        customer: { select: { id: true, name: true, no: true } },
        driver: { select: { id: true, name: true, no: true } },
      },
    });

    res.json({ success: true, data: rides });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /rides/:id
router.get('/:id', async (req, res) => {
  try {
    const ride = await prisma.ride.findUnique({
      where: { id: req.params.id },
      include: { customer: true, driver: true },
    });
    if (!ride) return res.status(404).json({ success: false, error: 'Ride not found' });
    res.json({ success: true, data: ride });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /rides
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const fare = body.fare ?? 0;
    const discount = body.discount ?? 0;
    const extra = body.extra ?? 0;
    const total = fare + extra - discount;

    const ride = await prisma.ride.create({
      data: {
        date: body.date ?? new Date().toISOString().slice(0, 10),
        time: body.time ?? new Date().toTimeString().slice(0, 5),
        customerName: body.customerName,
        phone: body.phone,
        customerId: body.customerId,
        driverId: body.driverId,
        driverName: body.driverName,
        pickup: body.pickup,
        dropoff: body.dropoff,
        fare,
        discount,
        extra,
        total,
        note: body.note,
      },
    });
    res.status(201).json({ success: true, data: ride });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /rides/:id
router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const fare = body.fare ?? undefined;
    const discount = body.discount ?? undefined;
    const extra = body.extra ?? undefined;
    const total =
      fare !== undefined || discount !== undefined || extra !== undefined
        ? (body.fare ?? 0) + (body.extra ?? 0) - (body.discount ?? 0)
        : undefined;

    const ride = await prisma.ride.update({
      where: { id: req.params.id },
      data: {
        ...(body.date && { date: body.date }),
        ...(body.time && { time: body.time }),
        ...(body.customerName && { customerName: body.customerName }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.customerId !== undefined && { customerId: body.customerId || null }),
        ...(body.driverId !== undefined && { driverId: body.driverId || null }),
        ...(body.driverName !== undefined && { driverName: body.driverName }),
        ...(body.pickup && { pickup: body.pickup }),
        ...(body.dropoff && { dropoff: body.dropoff }),
        ...(fare !== undefined && { fare }),
        ...(discount !== undefined && { discount }),
        ...(extra !== undefined && { extra }),
        ...(total !== undefined && { total }),
        ...(body.note !== undefined && { note: body.note }),
      },
    });
    res.json({ success: true, data: ride });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /rides — 전체 삭제 (Body: { confirm: true }) — :id 보다 먼저 정의
router.delete('/', async (req, res) => {
  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({
        success: false,
        error: 'Body must include { confirm: true } to delete all rides',
      });
    }
    const result = await prisma.ride.deleteMany({});
    res.json({ success: true, data: { deleted: result.count } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /rides/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.ride.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true, data: null });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
