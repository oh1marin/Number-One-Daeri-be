import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /customers — 목록 (쿼리: ?field=name&q=홍길동, ?includeAppUsers=1)
router.get('/', async (req, res) => {
  try {
    const { field, q, includeAppUsers } = req.query;
    const where: Record<string, unknown> = {};

    if (field && typeof q === 'string' && q) {
      const fieldStr = String(field);
      if (['name', 'phone', 'category', 'memberNo', 'info'].includes(fieldStr)) {
        where[fieldStr] = { contains: q, mode: 'insensitive' };
      }
    }

    const includeAppUsersBool = includeAppUsers === '1' || includeAppUsers === 'true';
    // promo-list처럼 "앱회원만" 쓰는 케이스를 빠르게 하기 위해,
    // includeAppUsers=1이면 고객(Customer)은 조회/머지하지 않고 앱회원(User)만 반환한다.
    if (!includeAppUsersBool) {
      const customers = await prisma.customer.findMany({
        where,
        orderBy: { no: 'desc' },
        include: {
          referrer: { select: { id: true, name: true, no: true } },
        },
      });
      res.json({ success: true, data: customers });
      return;
    }

    const searchQ = typeof q === 'string' && q ? q.trim() : '';
    const userWhere = searchQ
      ? {
          deletedAt: null,
          OR: [
            { name: { contains: searchQ, mode: 'insensitive' as const } },
            { phone: { contains: searchQ } },
            { email: { contains: searchQ, mode: 'insensitive' as const } },
          ],
        }
      : { deletedAt: null };

    const appUsers = await prisma.user.findMany({
      where: userWhere,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        no: true,
        name: true,
        phone: true,
        email: true,
        mileageBalance: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { rides: true, referralAsReferrer: true } },
      },
    });

    const appUserList = appUsers.map((u) => ({
      id: u.id,
      no: u.no,
      registeredAt: u.createdAt,
      dmSend: false,
      smsSend: false,
      category: '앱회원',
      name: u.name,
      info: null,
      memberNo: null,
      address: null,
      addressDetail: null,
      phone: u.phone,
      mobile: u.phone,
      otherPhone: null,
      notes: null,
      referrerId: null,
      referrer: null,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      source: 'app_user' as const,
      mileageBalance: u.mileageBalance,
      rideCount: u._count.rides,
      // promo-list 필터용 추천수 카운트
      referrer1Count: u._count.referralAsReferrer,
      // FE에서 필드명 불일치 대비로 같이 매핑(aliases)
      referrerCount: u._count.referralAsReferrer,
      recommendCount: u._count.referralAsReferrer,
      email: u.email,
    }));

    res.json({ success: true, data: appUserList });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /customers/:id (Customer 또는 App User)
router.get('/:id', async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: { referrer: true },
    });
    if (customer) {
      res.json({ success: true, data: { ...customer, source: 'customer' } });
      return;
    }

    const appUser = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { _count: { select: { rides: true, referralAsReferrer: true } } },
    });
    if (appUser) {
      res.json({
        success: true,
        data: {
          id: appUser.id,
          no: appUser.no,
          registeredAt: appUser.createdAt,
          dmSend: false,
          smsSend: false,
          category: '앱회원',
          name: appUser.name,
          info: null,
          memberNo: null,
          address: null,
          addressDetail: null,
          phone: appUser.phone,
          mobile: appUser.phone,
          otherPhone: null,
          notes: null,
          referrerId: null,
          referrer: null,
          createdAt: appUser.createdAt,
          updatedAt: appUser.updatedAt,
          source: 'app_user',
          mileageBalance: appUser.mileageBalance,
          email: appUser.email,
          rideCount: appUser._count.rides,
          // 추천수 카운트(관리자 리스트/필터와 동일 의미)
          referrer1Count: appUser._count.referralAsReferrer,
          referrerCount: appUser._count.referralAsReferrer,
          recommendCount: appUser._count.referralAsReferrer,
        },
      });
      return;
    }

    res.status(404).json({ success: false, error: 'Customer not found' });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /customers/:id/rides (Customer 또는 App User)
router.get('/:id/rides', async (req, res) => {
  try {
    const id = req.params.id;
    const rides = await prisma.ride.findMany({
      where: { OR: [{ customerId: id }, { userId: id }] },
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

// PUT /customers/:id (Customer만 수정 가능)
router.put('/:id', async (req, res) => {
  try {
    const exists = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!exists) {
      const appUser = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
      if (appUser) {
        res.status(400).json({ success: false, error: '앱 회원은 고객 수정으로 변경할 수 없습니다. /admin/users 사용' });
        return;
      }
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
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

// DELETE /customers/:id (Customer만 삭제 가능)
router.delete('/:id', async (req, res) => {
  try {
    const exists = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!exists) {
      const appUser = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
      if (appUser) {
        res.status(400).json({ success: false, error: '앱 회원은 여기서 삭제할 수 없습니다. /admin/users 사용' });
        return;
      }
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
