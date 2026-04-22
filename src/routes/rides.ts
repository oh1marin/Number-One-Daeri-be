import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

const BULK_RIDE_MAX = 500;

function parseMoney(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

const PAYMENT_METHODS = new Set(['cash', 'mileage', 'card', 'kakaopay', 'tosspay']);

function normalizePaymentMethod(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return 'cash';
  if (PAYMENT_METHODS.has(s)) return s;
  if (/마일|mileage/.test(s)) return 'mileage';
  if (/카드|card/.test(s)) return 'card';
  if (/카카오|kakao/.test(s)) return 'kakaopay';
  if (/토스|toss/.test(s)) return 'tosspay';
  if (/현금|cash/.test(s)) return 'cash';
  return 'cash';
}

const RIDE_STATUSES = new Set(['pending', 'accepted', 'driving', 'completed', 'cancelled']);

function normalizeRideStatus(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return 'completed';
  if (RIDE_STATUSES.has(s)) return s;
  if (/완료|complete/.test(s)) return 'completed';
  if (/대기|접수|pending/.test(s)) return 'pending';
  if (/수락|배정|accepted/.test(s)) return 'accepted';
  if (/운행|진행|driving/.test(s)) return 'driving';
  if (/취소|cancel/.test(s)) return 'cancelled';
  return 'completed';
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** 관리자 벌크용: 활성 앱 회원 전화 → userId */
async function buildPhoneToUserIdMap(): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, phone: { not: null } },
    select: { id: true, phone: true },
  });
  const map = new Map<string, string>();
  for (const u of users) {
    const d = digitsOnly(u.phone || '');
    if (d.length >= 10) map.set(d, u.id);
  }
  return map;
}

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

// POST /rides/bulk-import — 관리자: 엑셀 등 운행 일괄 등록 { items: [...] }
// 필수: customerName, pickup, dropoff. 선택: date, time, phone, fare, discount, extra, total, estimatedFare, paymentMethod, status, driverName, note, linkUserByPhone(기본 true)
router.post('/bulk-import', async (req, res) => {
  try {
    const { items, linkUserByPhone } = req.body as {
      items?: unknown[];
      linkUserByPhone?: boolean;
    };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'items는 비어 있지 않은 배열이어야 합니다.' });
      return;
    }
    if (items.length > BULK_RIDE_MAX) {
      res.status(400).json({
        success: false,
        error: `한 번에 최대 ${BULK_RIDE_MAX}건까지 등록할 수 있습니다.`,
      });
      return;
    }

    const doLink = linkUserByPhone !== false;
    const phoneMap = doLink ? await buildPhoneToUserIdMap() : new Map<string, string>();

    const today = new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toTimeString().slice(0, 5);

    type RowErr = { index: number; message: string };
    const rowErrors: RowErr[] = [];
    const dataToCreate: {
      date: string;
      time: string;
      customerName: string;
      phone: string | null;
      userId: string | null;
      pickup: string;
      dropoff: string;
      fare: number;
      discount: number;
      extra: number;
      total: number;
      estimatedFare: number | null;
      paymentMethod: string;
      status: string;
      driverName: string | null;
      note: string | null;
    }[] = [];

    for (let i = 0; i < items.length; i++) {
      const raw = items[i];
      if (raw == null || typeof raw !== 'object') {
        rowErrors.push({ index: i, message: '행이 객체가 아닙니다.' });
        continue;
      }
      const o = raw as Record<string, unknown>;
      const customerName = String(o.customerName ?? '').trim();
      const pickup = String(o.pickup ?? '').trim();
      const dropoff = String(o.dropoff ?? '').trim();
      if (!customerName && !pickup && !dropoff) continue;

      if (!customerName) rowErrors.push({ index: i, message: '고객명(customerName)이 비었습니다.' });
      if (!pickup) rowErrors.push({ index: i, message: '출발지(pickup)가 비었습니다.' });
      if (!dropoff) rowErrors.push({ index: i, message: '목적지(dropoff)가 비었습니다.' });
      if (!customerName || !pickup || !dropoff) continue;

      const dateRaw = String(o.date ?? '').trim();
      const timeRaw = String(o.time ?? '').trim();
      const date = dateRaw || today;
      const time = timeRaw || nowTime;

      const fare = parseMoney(o.fare);
      const discount = parseMoney(o.discount);
      const extra = parseMoney(o.extra);
      let total = parseMoney(o.total);
      if (total === 0 && (fare !== 0 || discount !== 0 || extra !== 0)) {
        total = fare + extra - discount;
      }
      if (total < 0) {
        rowErrors.push({ index: i, message: '합계(total)가 음수가 될 수 없습니다.' });
        continue;
      }

      const phoneStr = o.phone != null && String(o.phone).trim() !== '' ? String(o.phone).trim() : null;
      const digits = phoneStr ? digitsOnly(phoneStr) : '';
      const userId =
        doLink && digits.length >= 10 ? (phoneMap.get(digits) ?? null) : null;

      const est = o.estimatedFare;
      const estimatedFare =
        est == null || est === '' ? null : (Number.isFinite(Number(est)) ? Math.round(Number(est)) : null);

      dataToCreate.push({
        date,
        time,
        customerName,
        phone: phoneStr,
        userId,
        pickup,
        dropoff,
        fare,
        discount,
        extra,
        total,
        estimatedFare,
        paymentMethod: normalizePaymentMethod(o.paymentMethod),
        status: normalizeRideStatus(o.status),
        driverName:
          o.driverName != null && String(o.driverName).trim() !== ''
            ? String(o.driverName).trim()
            : null,
        note: o.note != null && String(o.note).trim() !== '' ? String(o.note).trim() : null,
      });
    }

    if (rowErrors.length > 0) {
      res.status(400).json({
        success: false,
        error: '일부 행 검증에 실패했습니다.',
        data: { rowErrors, validCount: dataToCreate.length },
      });
      return;
    }

    if (dataToCreate.length === 0) {
      res.status(400).json({ success: false, error: '등록할 유효한 행이 없습니다.' });
      return;
    }

    const result = await prisma.$transaction(
      dataToCreate.map((d) =>
        prisma.ride.create({
          data: {
            date: d.date,
            time: d.time,
            customerName: d.customerName,
            phone: d.phone,
            userId: d.userId,
            pickup: d.pickup,
            dropoff: d.dropoff,
            fare: d.fare,
            discount: d.discount,
            extra: d.extra,
            total: d.total,
            ...(d.estimatedFare != null ? { estimatedFare: d.estimatedFare } : {}),
            paymentMethod: d.paymentMethod,
            status: d.status,
            driverName: d.driverName,
            note: d.note,
          },
          select: { id: true },
        }),
      ),
    );

    res.status(201).json({
      success: true,
      data: {
        created: result.length,
        ids: result.map((r) => r.id),
        linkedUsers: dataToCreate.filter((d) => d.userId).length,
      },
    });
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
