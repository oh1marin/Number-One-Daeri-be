import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /rides — 목록 (관리자 콜 리스트: No, 접수번호, 전화번호, 접수시간, 경과(초), 상태, 출발지, 도착지, 요금, 현금/카드/마일, 결제방법, 접수구분)
// 쿼리: ?date=, ?driverName=, ?field=phone&q=, ?page=1&limit=50
router.get('/', async (req, res) => {
  try {
    const { date, driverName, field, q, page, limit } = req.query;
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

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [rides, total] = await Promise.all([
      prisma.ride.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limitNum,
        include: {
          customer: { select: { id: true, name: true, no: true } },
          driver: { select: { id: true, name: true, no: true } },
          user: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.ride.count({ where }),
    ]);

    const now = Date.now();
    const items = rides.map((r, i) => {
      const createdAt = r.createdAt ? new Date(r.createdAt).getTime() : now;
      const elapsedSeconds = Math.max(0, Math.floor((now - createdAt) / 1000));
      const method = r.paymentMethod || 'cash';
      const totalAmount = r.total ?? 0;
      const estimatedAmount = r.estimatedFare ?? 0;
      const displayFare = totalAmount > 0 ? totalAmount : estimatedAmount; // 완료 전엔 예정요금 표시
      // 16680001은 스펙 기본값 → 실제 휴대번호는 user.phone에서 가져옴
      const displayPhone =
        r.phone === '16680001' || !/^010\d{8}$/.test((r.phone || '').replace(/\D/g, ''))
          ? (r.user?.phone ?? r.phone ?? '')
          : (r.phone ?? r.user?.phone ?? '');

      return {
        no: skip + i + 1,
        receiptNo: r.id,
        receipt_no: r.id,
        phone: displayPhone,
        user: r.user ? { id: r.user.id, name: r.user.name, phone: r.user.phone } : null,
        receivedAt: r.createdAt,
        date: r.date,
        time: r.time,
        elapsedSeconds,
        status: r.status,
        pickup: r.pickup ?? '',
        dropoff: r.dropoff ?? r.destinationAddress ?? '',
        pickup_address: r.pickup ?? '',
        dropoff_address: r.dropoff ?? r.destinationAddress ?? '',
        fare: r.fare,
        total: totalAmount,
        fee: totalAmount,
        estimatedFare: r.estimatedFare ?? null,
        displayFare, // 요금 컬럼용: total 있으면 total, 없으면 estimatedFare
        amount: displayFare,
        cashAmount: method === 'cash' ? totalAmount : 0,
        cardAmount: method === 'card' ? totalAmount : 0,
        kakaopayAmount: method === 'kakaopay' ? totalAmount : 0,
        tosspayAmount: method === 'tosspay' ? totalAmount : 0,
        mileageAmount: method === 'mileage' ? totalAmount : 0,
        paymentMethod: method,
        source: r.userId ? 'app' : 'manual',
        customerName: r.customerName,
        driverName: r.driverName,

        // 대리호출 옵션(선택)
        transmission: r.transmission ?? null,
        transmissionLabel:
          r.transmission === 'auto'
            ? '오토'
            : r.transmission === 'stick'
              ? '스틱'
              : null,
        serviceType: r.serviceType ?? null,
        serviceTypeLabel:
          r.serviceType === 'daeri'
            ? '대리운전'
            : r.serviceType === 'taksong'
              ? '탁송'
              : null,
        quickBoard: r.quickBoard ?? null,
        quickBoardLabel:
          r.quickBoard === 'possible'
            ? '퀵보드 가능'
            : r.quickBoard === 'impossible'
              ? '퀵보드 불가'
              : null,
        vehicleType: r.vehicleType ?? null,
        vehicleTypeLabel:
          r.vehicleType === 'sedan'
            ? '승용차'
            : r.vehicleType === '9seater'
              ? '9인승'
              : r.vehicleType === '12seater'
                ? '12인승'
                : r.vehicleType === 'cargo1t'
                  ? '화물 1톤'
                  : null,

        customer: r.customer,
        driver: r.driver,
      };
    });

    res.json({ success: true, data: { items, total, page: pageNum, limit: limitNum } });
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

// POST /rides/:id/price — 예정요금(estimatedFare) 저장
// FE에서 입력한 estimatedFare를 rides.estimatedFare에 반영한다.
router.post('/:id/price', async (req, res) => {
  try {
    const { estimatedFare } = req.body;
    const amount = Number(estimatedFare);

    if (!Number.isInteger(amount) || amount < 0) {
      res.status(400).json({ success: false, error: 'estimatedFare는 0 이상의 정수여야 합니다.' });
      return;
    }

    const ride = await prisma.ride.update({
      where: { id: req.params.id },
      data: { estimatedFare: amount },
      select: { id: true, estimatedFare: true },
    });

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
