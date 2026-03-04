import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /customers — 목록 (쿼리: ?field=name&q=홍길동)
router.get('/', async (req, res) => {
  try {
    const { field, q } = req.query;
    const where: Record<string, unknown> = {};

    if (field && typeof q === 'string' && q) {
      const fieldStr = String(field);
      if (['name', 'phone', 'category', 'memberNo', 'info'].includes(fieldStr)) {
        where[fieldStr] = { contains: q, mode: 'insensitive' };
      }
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { no: 'desc' },
      include: {
        referrer: { select: { id: true, name: true, no: true } },
      },
    });

    res.json({ success: true, data: customers });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /customers/:id
router.get('/:id', async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: { referrer: true },
    });
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    res.json({ success: true, data: customer });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /customers/:id/rides
router.get('/:id/rides', async (req, res) => {
  try {
    const rides = await prisma.ride.findMany({
      where: { customerId: req.params.id },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
    });
    res.json({ success: true, data: rides });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /customers
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const registeredAt = body.registeredAt
      ? new Date(body.registeredAt)
      : new Date();

    const customer = await prisma.customer.create({
      data: {
        registeredAt,
        dmSend: body.dmSend ?? false,
        smsSend: body.smsSend ?? false,
        category: body.category ?? '일반회원',
        name: body.name,
        info: body.info,
        memberNo: body.memberNo,
        address: body.address,
        addressDetail: body.addressDetail,
        phone: body.phone,
        mobile: body.mobile,
        otherPhone: body.otherPhone,
        notes: body.notes,
        referrerId: body.referrerId,
      },
    });
    res.status(201).json({ success: true, data: customer });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /customers/:id
router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        ...(body.registeredAt && { registeredAt: new Date(body.registeredAt) }),
        ...(typeof body.dmSend === 'boolean' && { dmSend: body.dmSend }),
        ...(typeof body.smsSend === 'boolean' && { smsSend: body.smsSend }),
        ...(body.category && { category: body.category }),
        ...(body.name && { name: body.name }),
        ...(body.info !== undefined && { info: body.info }),
        ...(body.memberNo !== undefined && { memberNo: body.memberNo }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.addressDetail !== undefined && { addressDetail: body.addressDetail }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.mobile !== undefined && { mobile: body.mobile }),
        ...(body.otherPhone !== undefined && { otherPhone: body.otherPhone }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.referrerId !== undefined && { referrerId: body.referrerId || null }),
      },
    });
    res.json({ success: true, data: customer });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /customers/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.customer.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true, data: null });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
