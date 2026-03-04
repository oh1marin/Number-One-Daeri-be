# 비즈니스 로직 규칙

이 문서는 면접에서 직접 설명할 수 있어야 하는 핵심 로직을 정의한다.

---

## 1. 요금 계산 (Fare Calculation)

### 기본 요금 공식

```
요금 = 기본요금 + (거리요금 × 초과거리) + (시간요금 × 초과시간)
```

### 호출 타입별 요금 기준

| 타입 | 기본요금 | 기본거리 | 거리당 요금 | 기본시간 | 시간당 요금 |
|------|----------|----------|------------|----------|------------|
| NORMAL | 4,800원 | 2km | 900원/100m | 15분 | 200원/30초 |
| QUICK | 5,500원 | 2km | 1,000원/100m | 15분 | 220원/30초 |
| PREMIUM | 8,000원 | 2km | 1,200원/100m | 15분 | 250원/30초 |

### 할증 규칙

| 조건 | 할증률 |
|------|--------|
| 심야 (00:00 ~ 04:00) | +20% |
| 명절 연휴 | +30% |
| 우천 | +10% (관리자 수동 설정) |

### 요금 계산 코드 구조

```typescript
// src/utils/geo.ts

interface FareInput {
  distance: number;       // km
  duration: number;       // 분
  rideType: RideType;
  requestedAt: Date;
}

interface FareResult {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  surchargeRate: number;
  totalFare: number;
}

function calculateFare(input: FareInput): FareResult {
  const config = FARE_CONFIG[input.rideType];

  // 거리 요금
  const extraDistance = Math.max(0, input.distance - config.baseDistanceKm);
  const distanceFare = Math.floor(extraDistance * 1000 / 100) * config.perHundredMeterFare;

  // 시간 요금
  const extraDuration = Math.max(0, input.duration - config.baseDurationMin);
  const timeFare = Math.floor(extraDuration * 60 / 30) * config.per30SecFare;

  // 할증
  const surchargeRate = getSurchargeRate(input.requestedAt);

  const subtotal = config.baseFare + distanceFare + timeFare;
  const totalFare = Math.ceil(subtotal * (1 + surchargeRate) / 100) * 100; // 100원 단위 올림

  return {
    baseFare: config.baseFare,
    distanceFare,
    timeFare,
    surchargeRate,
    totalFare,
  };
}
```

---

## 2. 배차 알고리즘 (Matching Algorithm)

### 흐름도

```
POST /rides 수신
    │
    ▼
반경 N km 이내 ONLINE 기사 조회
(rideType에 따라 N 결정: QUICK=3km, NORMAL=5km, PREMIUM=전국)
    │
    ▼
거리 오름차순 정렬 후 큐 생성
    │
    ▼
┌────────────────────────────────┐
│  큐에서 첫 번째 기사 꺼냄        │
│  Socket emit: ride:new_request  │
│  Redis에 타임아웃 설정 (30초)   │
└────────────────────────────────┘
    │
    ├─ 수락 (30초 이내) ──► MATCHED → ACCEPTED
    │
    ├─ 거절 ──────────────► 다음 기사 시도
    │
    └─ 30초 초과 ──────────► 다음 기사 시도
         │
         ▼
    모든 기사 시도 완료 or 큐 비어있음
         │
         ▼
    FAILED (고객에게 알림)
```

### 재배차 제한

- 동일 기사에게 연속 재요청 없음 (한 번 거절하면 해당 콜에서 제외)
- 최대 시도 횟수: 10명
- 전체 타임아웃: 5분 (PENDING 상태 유지 최대 시간)

### Redis 활용

```
Key: ride:matching:{rideId}
Value: { driverId, expiresAt }
TTL: 30초

기사 큐: ride:queue:{rideId} (List 타입)
```

---

## 3. 취소 수수료 정책

### 조건별 수수료

```typescript
function calculateCancellationFee(ride: Ride, cancelledBy: CancelledBy): number {
  if (cancelledBy === 'DRIVER' || cancelledBy === 'SYSTEM') {
    return 0; // 기사/시스템 취소 시 고객 수수료 없음
  }

  const now = new Date();

  // PENDING 상태 취소: 무조건 무료
  if (ride.status === 'PENDING' || ride.status === 'MATCHED') {
    return 0;
  }

  // ACCEPTED 상태 취소
  if (ride.status === 'ACCEPTED') {
    const acceptedAt = ride.acceptedAt!;
    const minutesElapsed = (now.getTime() - acceptedAt.getTime()) / 1000 / 60;

    if (minutesElapsed <= 3) {
      return 0; // 수락 후 3분 이내 무료
    }
    return 3000; // 3분 초과 시 3,000원
  }

  // ARRIVED 상태 취소
  if (ride.status === 'ARRIVED') {
    return 5000; // 도착 후 취소 5,000원
  }

  // DRIVING 중 취소: 관리자만 가능
  return 0;
}
```

### 취소 수수료 처리

- 고객 취소 수수료는 다음 운행 시 자동 청구 또는 등록 카드 청구
- 기사 취소 시 → 패널티 누적, 고객에게는 수수료 없음

---

## 4. 기사 패널티 시스템

### 패널티 발생 조건

| 조건 | 패널티 |
|------|--------|
| 콜 수락 후 취소 (ACCEPTED 상태에서) | 1회 |
| 도착 후 취소 (ARRIVED 상태에서) | 1회 |
| 30초 내 미응답 (자동 거절) | 0.5회 (누적 2회 = 1패널티) |

### 패널티별 제재

```typescript
async function applyPenalty(driverId: string): Promise<void> {
  const driver = await prisma.driver.update({
    where: { id: driverId },
    data: { penaltyCount: { increment: 1 } },
  });

  if (driver.penaltyCount >= 7) {
    // 관리자 검토 대상으로 플래그
    await notifyAdmin(`기사 ${driverId} 패널티 ${driver.penaltyCount}회 도달`);
  } else if (driver.penaltyCount >= 3) {
    // 24시간 정지
    await prisma.driver.update({
      where: { id: driverId },
      data: {
        status: 'OFFLINE',
        suspendedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  } else {
    // 경고 알림
    await notifyDriver(driverId, '경고: 취소가 누적되면 이용 제한될 수 있습니다.');
  }
}
```

---

## 5. 마일리지 정책

### 적립 규칙

```typescript
async function earnMileage(userId: string, rideId: string, fare: number): Promise<void> {
  const earnAmount = Math.floor(fare * 0.01); // 운임의 1%

  if (earnAmount < 1) return; // 최소 1원 이상만 적립

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1년 유효

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { mileageBalance: { increment: earnAmount } },
    }),
    prisma.mileageHistory.create({
      data: {
        userId,
        type: 'EARN',
        amount: earnAmount,
        balance: 0, // 트랜잭션 후 실제 잔액으로 업데이트
        description: '운행 완료 적립',
        rideId,
        expiresAt,
      },
    }),
  ]);
}
```

### 사용 규칙

- 최소 사용 단위: 1,000원
- 최대 사용 한도: 운임의 100% (전액 포인트 결제 가능)
- 포인트 + 카드 혼합 결제: 지원하지 않음 (단일 방식)

### 만료 처리

- 매일 자정 배치: 만료된 마일리지 차감
- 차감 시 `MileageHistory` 에 `EXPIRE` 타입 레코드 생성

---

## 6. 결제 실패 재처리

### 재처리 흐름

```
결제 실패 (PortOne API 오류 or 카드 한도 초과)
    │
    ▼
Payment.status = FAILED
Payment.failCount += 1
Payment.lastFailedAt = now()
    │
    ▼
Redis 재처리 큐에 등록
Key: payment:retry:{paymentId}
TTL: 24시간
    │
    ▼
재처리 잡 (10분 주기 실행)
    │
    ├─ failCount < 3 → PG API 재호출
    │
    └─ failCount >= 3 → 관리자 알림 + 고객 알림
                        (카드 확인 요청)
```

### 결제 상태 체크

```typescript
async function retryFailedPayments(): Promise<void> {
  const failedPayments = await prisma.payment.findMany({
    where: {
      status: 'FAILED',
      failCount: { lt: 3 },
      lastFailedAt: {
        lt: new Date(Date.now() - 10 * 60 * 1000), // 10분 이상 지난 것만
      },
    },
    include: { ride: true },
  });

  for (const payment of failedPayments) {
    await processPayment(payment);
  }
}
```

---

## 7. 정산 계산 (Settlement)

### 배치 실행 (매일 00:05)

```typescript
async function runDailySettlement(date: Date): Promise<void> {
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);

  // 전날 완료된 운행을 기사별로 집계
  const completedRides = await prisma.ride.groupBy({
    by: ['driverId'],
    where: {
      status: 'COMPLETED',
      completedAt: {
        gte: startOfDay(yesterday),
        lt: startOfDay(date),
      },
      driverId: { not: null },
    },
    _count: { id: true },
    _sum: { actualFare: true },
  });

  const COMMISSION_RATE = 0.2; // 20%

  for (const group of completedRides) {
    if (!group.driverId) continue;

    const totalFare = group._sum.actualFare ?? 0;
    const commission = Math.floor(totalFare * COMMISSION_RATE);
    const earnings = totalFare - commission;

    await prisma.settlement.upsert({
      where: {
        driverId_date: {
          driverId: group.driverId,
          date: yesterday,
        },
      },
      create: {
        driverId: group.driverId,
        date: yesterday,
        rideCount: group._count.id,
        totalFare,
        commissionRate: COMMISSION_RATE,
        commission,
        earnings,
      },
      update: {
        rideCount: group._count.id,
        totalFare,
        commission,
        earnings,
      },
    });
  }
}
```

---

## 8. 추천인 보상

```typescript
async function processReferralBonus(newUserId: string, referralCode: string): Promise<void> {
  const referrer = await prisma.user.findUnique({
    where: { referralCode },
  });

  if (!referrer) return;

  const BONUS_AMOUNT = 3000;

  await prisma.$transaction([
    // 추천인에게 마일리지 지급
    prisma.user.update({
      where: { id: referrer.id },
      data: { mileageBalance: { increment: BONUS_AMOUNT } },
    }),
    prisma.mileageHistory.create({
      data: {
        userId: referrer.id,
        type: 'ADMIN_GRANT',
        amount: BONUS_AMOUNT,
        balance: 0,
        description: `추천인 보상 (${newUserId} 가입)`,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    }),
    // 신규 가입자에 추천인 연결
    prisma.user.update({
      where: { id: newUserId },
      data: { referredById: referrer.id },
    }),
  ]);
}
```

---

## 9. 실시간 동기화 전략

### 위치 업데이트 주기

- 기사 앱 → 서버: 3초마다 Socket emit
- 서버 → 고객 앱: 받은 즉시 relay
- 서버 → Redis: 기사 위치 캐싱 (배차 알고리즘에서 활용)

```
Key: driver:location:{driverId}
Value: { lat, lng, updatedAt }
TTL: 30초 (30초 이상 업데이트 없으면 OFFLINE 처리)
```

### 운행 상태 변경 시

```
서버에서 상태 변경 발생
    │
    ├─ DB 업데이트 (Ride.status)
    │
    ├─ Socket emit → 고객 앱
    │
    ├─ Socket emit → 기사 앱
    │
    └─ Socket emit → 관리자 웹 (admin:ride_update)
```

---

## 10. 에러 코드 목록

| 코드 | 설명 |
|------|------|
| `AUTH_INVALID_TOKEN` | 유효하지 않은 토큰 |
| `AUTH_TOKEN_EXPIRED` | 만료된 토큰 |
| `AUTH_UNAUTHORIZED` | 권한 없음 |
| `USER_NOT_FOUND` | 사용자 없음 |
| `RIDE_NOT_FOUND` | 운행 정보 없음 |
| `RIDE_INVALID_STATUS` | 상태 전이 불가 (현재 상태에서 불가능한 액션) |
| `RIDE_NO_DRIVER_AVAILABLE` | 주변 기사 없음 |
| `RIDE_ALREADY_ACTIVE` | 이미 진행 중인 운행 있음 |
| `PAYMENT_FAILED` | 결제 실패 |
| `PAYMENT_ALREADY_PAID` | 이미 결제 완료 |
| `MILEAGE_INSUFFICIENT` | 마일리지 잔액 부족 |
| `CARD_NOT_FOUND` | 카드 없음 |
| `DRIVER_PENDING_APPROVAL` | 기사 승인 대기 중 |
| `DRIVER_SUSPENDED` | 기사 계정 정지 |
