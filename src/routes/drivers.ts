import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /drivers
router.get('/', async (req, res) => {
  try {
    const drivers = await prisma.driver.findMany({
      orderBy: { no: 'desc' },
    });
    res.json({ success: true, data: drivers });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /drivers/:id
router.get('/:id', async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { id: req.params.id },
    });
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });
    res.json({ success: true, data: driver });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /drivers/:id/rides
router.get('/:id/rides', async (req, res) => {
  try {
    const rides = await prisma.ride.findMany({
      where: { driverId: req.params.id },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
    });
    res.json({ success: true, data: rides });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /drivers
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const registeredAt = body.registeredAt
      ? new Date(body.registeredAt)
      : new Date();

    const bcrypt = await import('bcryptjs');
    const hashedPassword = body.password
      ? await bcrypt.hash(String(body.password), 10)
      : null;

    const driver = await prisma.driver.create({
      data: {
        registeredAt,
        name: body.name,
        region: body.region,
        timeSlot: body.timeSlot,
        address: body.address,
        addressZip: body.addressZip,
        addressDetail: body.addressDetail,
        phone: body.phone,
        mobile: body.mobile,
        licenseNo: body.licenseNo,
        residentNo: body.residentNo,
        aptitudeTest: body.aptitudeTest,
        notes: body.notes,
        password: hashedPassword,
      },
    });
    res.status(201).json({ success: true, data: driver });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /drivers/:id
router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const bcrypt = await import('bcryptjs');
    const hashedPassword = body.password
      ? await bcrypt.hash(String(body.password), 10)
      : undefined;

    const driver = await prisma.driver.update({
      where: { id: req.params.id },
      data: {
        ...(body.registeredAt && { registeredAt: new Date(body.registeredAt) }),
        ...(body.name !== undefined && { name: body.name }),
        ...(hashedPassword && { password: hashedPassword }),
        ...(body.region !== undefined && { region: body.region }),
        ...(body.timeSlot !== undefined && { timeSlot: body.timeSlot }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.addressZip !== undefined && { addressZip: body.addressZip }),
        ...(body.addressDetail !== undefined && { addressDetail: body.addressDetail }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.mobile !== undefined && { mobile: body.mobile }),
        ...(body.licenseNo !== undefined && { licenseNo: body.licenseNo }),
        ...(body.residentNo !== undefined && { residentNo: body.residentNo }),
        ...(body.aptitudeTest !== undefined && { aptitudeTest: body.aptitudeTest }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });
    res.json({ success: true, data: driver });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /drivers/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.driver.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true, data: null });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
