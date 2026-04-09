import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { findNearbyDrivers } from '../../services/matchingService';

const router = Router();

const FARE_TYPES = ['premium', 'fast', 'normal'] as const;
const PAYMENT_METHODS = ['cash', 'mileage', 'card', 'kakaopay', 'tosspay'] as const;
const TRANSMISSIONS = ['auto', 'stick'] as const;
const SERVICE_TYPES = ['daeri', 'taksong'] as const;
const QUICK_BOARD_OPTIONS = ['possible', 'impossible'] as const;
const VEHICLE_TYPES = ['sedan', '9seater', '12seater', 'cargo1t'] as const;

/** Haversine 거리(km) */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // 지구 반경 km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** 거리(km) → 요금 산정 (64km 기준: 일반 64,000 / 빠른 72,000 / 프리미엄 82,000) */
const PER_KM_NORMAL = 1000;   // 64km → 64,000원
const PER_KM_FAST = 1125;     // 64km → 72,000원
const PER_KM_PREMIUM = 82000 / 64; // 64km → 82,000원 (1281.25)

function estimateFares(distanceKm: number): {
  premium: number;
  fast: number;
  normal: number;
} {
  return {
    normal: Math.round(distanceKm * PER_KM_NORMAL),
    fast: Math.round(distanceKm * PER_KM_FAST),
    premium: Math.round(distanceKm * PER_KM_PREMIUM),
  };
}

// POST /rides/estimate — 예상 요금 산정
router.post('/estimate', async (req, res) => {
  try {
    const { originLatitude, originLongitude, destinationLatitude, destinationLongitude } =
      req.body;
    const oLat = Number(originLatitude);
    const oLng = Number(originLongitude);
    const dLat = Number(destinationLatitude);
    const dLng = Number(destinationLongitude);

    if (!Number.isFinite(oLat) || !Number.isFinite(oLng) || !Number.isFinite(dLat) || !Number.isFinite(dLng)) {
      res.status(400).json({
        success: false,
        error: 'originLatitude, originLongitude, destinationLatitude, destinationLongitude 필수',
      });
      return;
    }

    const distanceKm = haversineKm(oLat, oLng, dLat, dLng);
    const fares = estimateFares(distanceKm);

    res.json({
      success: true,
      data: {
        distanceKm: Math.round(distanceKm * 100) / 100,
        fares: {
          premium: fares.premium,
          fast: fares.fast,
          normal: fares.normal,
        },
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /rides/call — 대리운전 콜 생성 + 배차 시도
router.post('/call', async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      latitude,
      longitude,
      address,
      addressDetail,
      phone,
      destinationLatitude,
      destinationLongitude,
      destinationAddress,
      fareType = 'normal',
      paymentMethod = 'cash',
      cardId,
      estimatedDistanceKm,
      estimatedFare,
      transmission,
      serviceType,
      quickBoard,
      vehicleType,
    } = req.body;

    if (!address) {
      res.status(400).json({ success: false, error: 'address 필수' });
      return;
    }

    if (!FARE_TYPES.includes(fareType)) {
      res.status(400).json({
        success: false,
        error: 'FARE_TYPE_INVALID',
        message: 'fareType은 premium, fast, normal 중 하나여야 합니다.',
      });
      return;
    }

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      res.status(400).json({
        success: false,
        error: 'PAYMENT_METHOD_INVALID',
        message: 'paymentMethod는 cash, mileage, card, kakaopay, tosspay 중 하나여야 합니다.',
      });
      return;
    }

    // 옵션 값은 optional이지만, 들어오면 allowed 값만 허용
    if (transmission != null && !TRANSMISSIONS.includes(transmission)) {
      res.status(400).json({ success: false, error: 'TRANSMISSION_INVALID' });
      return;
    }
    if (serviceType != null && !SERVICE_TYPES.includes(serviceType)) {
      res.status(400).json({ success: false, error: 'SERVICE_TYPE_INVALID' });
      return;
    }
    if (quickBoard != null && !QUICK_BOARD_OPTIONS.includes(quickBoard)) {
      res.status(400).json({ success: false, error: 'QUICK_BOARD_INVALID' });
      return;
    }
    if (vehicleType != null && !VEHICLE_TYPES.includes(vehicleType)) {
      res.status(400).json({ success: false, error: 'VEHICLE_TYPE_INVALID' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    // 마일리지 결제: 잔액 검증
    if (paymentMethod === 'mileage') {
      const need = Math.max(0, Number(estimatedFare) || 0);
      if (user.mileageBalance < need) {
        res.status(400).json({
          success: false,
          error: 'INSUFFICIENT_MILEAGE',
          message: '마일리지 잔액이 부족합니다.',
        });
        return;
      }
    }

    // 카드 결제: 등록 카드 검증 (cardId 선택 시 해당 카드, 없으면 1장 이상 있어야 함)
    if (paymentMethod === 'card') {
      if (cardId) {
        const card = await prisma.userCard.findFirst({
          where: { id: cardId, userId },
        });
        if (!card) {
          return res.status(400).json({
            success: false,
            error: 'CARD_NOT_FOUND',
            message: '선택한 카드를 찾을 수 없습니다.',
          });
        }
      } else {
        const cardCount = await prisma.userCard.count({ where: { userId } });
        if (cardCount === 0) {
          return res.status(400).json({
            success: false,
            error: 'NO_CARD_REGISTERED',
            message: '결제용 카드를 먼저 등록해 주세요.',
          });
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const time = new Date().toTimeString().slice(0, 5);
    const lat = latitude != null ? Number(latitude) : null;
    const lng = longitude != null ? Number(longitude) : null;
    const destLat = destinationLatitude != null ? Number(destinationLatitude) : null;
    const destLng = destinationLongitude != null ? Number(destinationLongitude) : null;
    // FE 매핑:
    // - latitude/longitude = 출발(픽업) 좌표
    // - address = 출발지(UI 문자열)
    // - addressDetail = 도착 관련 문자열(도착 address 또는 장소명). 도착 미선택이면 ""(또는 미포함)
    // - destinationAddress/destinationLatitude/destinationLongitude는 있으면 우선 사용(앱 확장 대비)
    const destinationAddrText = destinationAddress || addressDetail || null;
    const dropoffText = destinationAddrText || address;
    const rideAddressDetail =
      typeof addressDetail === 'string' && addressDetail.trim() !== '' ? addressDetail.trim() : null;

    const ride = await prisma.ride.create({
      data: {
        date: today,
        time,
        customerName: user.name ?? '앱 사용자',
        phone: phone ?? user.phone ?? '16680001',
        userId,
        pickup: address,
        dropoff: dropoffText,
        latitude: lat,
        longitude: lng,
        // 앱이 보내는 도착 설명 문자열(없으면 null)
        addressDetail: rideAddressDetail,
        destinationLatitude: destLat,
        destinationLongitude: destLng,
        destinationAddress: destinationAddrText,

        // 대리호출 옵션(선택)
        transmission: transmission ?? null,
        serviceType: serviceType ?? null,
        quickBoard: quickBoard ?? null,
        vehicleType: vehicleType ?? null,

        fareType,
        paymentMethod,
        estimatedDistanceKm: estimatedDistanceKm != null ? Number(estimatedDistanceKm) : null,
        estimatedFare: estimatedFare != null ? Math.round(Number(estimatedFare)) : null,
        status: 'pending',
      },
    });

    // 마일리지 결제: 잔액만 검증. 실제 차감은 운행 완료 시(complete) 처리

    // 배차: 가까운 기사에게 콜 알림 (Socket)
    const io = (global as { io?: { to: (r: string) => { emit: (e: string, d: object) => void } } }).io;
    if (io && lat != null && lng != null) {
      const drivers = await findNearbyDrivers(lat, lng, 5);
      for (const d of drivers) {
        io.to(`driver:${d.id}`).emit('ride:new', {
          rideId: ride.id,
          pickup: address,
          pickupLat: lat,
          pickupLng: lng,
          // 드라이버 앱/배차 로직에서 활용 가능하도록 함께 전달(선택)
          transmission: ride.transmission,
          serviceType: ride.serviceType,
          quickBoard: ride.quickBoard,
          vehicleType: ride.vehicleType,
        });
      }
    }

    res.status(201).json({
      success: true,
      data: {
        rideId: ride.id,
        status: ride.status,
        estimatedTime: null,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /rides/my — 내 운행 목록
router.get('/my', async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const status = req.query.status as string | undefined;
    const skip = (page - 1) * limit;

    const where: { userId: string; status?: string } = { userId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.ride.findMany({
        where,
        orderBy: [{ date: 'desc' }, { time: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          date: true,
          time: true,
          pickup: true,
          dropoff: true,
          fare: true,
          discount: true,
          extra: true,
          total: true,
          status: true,
          driverName: true,
          fareType: true,
          paymentMethod: true,
          estimatedFare: true,
        },
      }),
      prisma.ride.count({ where }),
    ]);

    res.json({ success: true, data: { items, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /rides/:id — 운행 상세
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user!.id;
    const ride = await prisma.ride.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!ride) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: ride });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
