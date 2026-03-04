# 백엔드 전달 문서 (FE 구현 기준)

> 관리대장(web-admin)에 FE에서 구현한 데이터 구조·기능을 기준으로, 백엔드 스키마 설계 및 API 연동 시 참고용 문서입니다.

---

## 1. FE 구현 기능 요약

| 페이지 | 경로 | 기능 | 데이터 |
|---|---|---|---|
| 대시보드 | `/` | 건수·매출 요약, 최근 내역, 기사별 현황 | rides |
| 고객자료관리 | `/customers` | 고객 CRUD, 분류, 추천인, 마일리지 | customers |
| 고객관리대장 | `/customers/ledger` | 그리드 조회, 다중선택, 개인/단체 문자 | customers |
| 기사님 관리 | `/drivers` | 기사 CRUD, 운행이력 | drivers |
| 기사 근태관리 | `/attendance` | 월별 근태 그리드, 지각/결근/휴무 | attendance |
| 운행일보 | `/daily` | 일별 콜 목록, 기사 배정, 오더 접수 | rides |
| 콜 입력 | `/rides/new` | 고객·기사·출발/도착·요금 입력 | rides |
| 콜 조회 | `/rides` | 검색, 개별/전체 삭제 | rides |
| 통계 | `/statistics` | 기사별·출발지별·시간대별 | rides |
| 세금계산서 | `/invoices` | 세금계산서/거래명세서 CRUD, 인쇄 | invoices |
| 요금 설정 | `/settings` | 지역 목록, 지역별 요금 행렬 | settings |

---

## 2. 데이터 모델 (FE 타입 기준)

### 2.1 Customer (고객)

```typescript
interface Customer {
  id: string;
  no: number;               // 고객번호 (자동증가)
  registeredAt: string;     // 등록일자 (YYYY-MM-DD)
  dmSend: boolean;          // D.M 발송
  smsSend: boolean;         // 문자발송
  category: string;         // 고객분류 (동창, 직장동료, 지인, 거래처 등)
  name: string;             // 고객성명
  info: string;             // 고객정보
  memberNo: string;         // 회원번호
  address: string;          // 주소
  addressDetail: string;    // 상세주소
  phone: string;            // 전화번호
  mobile: string;           // 휴대폰
  otherPhone: string;       // 기타전화
  notes: string;            // 기타사항
  referrerId: string;       // 추천인 고객 ID
}
```

**고객분류 코드:** `동창`, `직장동료`, `지인`, `거래처`, `일반회원`, `종신회원`, `특별회원`, `친지가족`, `매입처`, `매출처`, `본인`

---

### 2.2 Driver (기사)

```typescript
interface Driver {
  id: string;
  no: number;               // 관리번호 (자동증가)
  registeredAt: string;     // 등록일자 (YYYY-MM-DD)
  name: string;             // 성명
  region: string;           // 담당지역
  timeSlot: string;         // 시간대 (아무때나, 새벽1시이후, 오전, 오후 등)
  address: string;          // 주소
  addressZip: string;       // 우편번호
  addressDetail: string;    // 상세주소
  phone: string;            // 전화번호
  mobile: string;           // 휴대폰
  licenseNo: string;        // 면허번호
  residentNo: string;       // 주민번호
  aptitudeTest: string;     // 적성검사 (예: 2005.04.20~)
  notes: string;
}
```

---

### 2.3 RideRecord (운행 콜)

```typescript
interface RideRecord {
  id: string;
  customerName: string;     // 고객명 및 업소명
  phone: string;            // 연락처
  date: string;             // 날짜 (YYYY-MM-DD)
  time: string;             // 시간 (HH:mm)
  driverName: string;       // 기사명
  pickup: string;           // 출발지
  dropoff: string;         // 도착지
  fare: number;             // 요금
  discount: number;         // 할인금액
  extra: number;            // 추가금액
  total: number;            // 금액합계 (= fare + extra - discount)
  note: string;             // 비고
  customerId?: string;     // (선택) 고객 연동 시 customer.id
}
```

**검색 필드:** `customerName`, `phone`, `date`, `time`, `pickup`, `dropoff`, `driverName`

---

### 2.4 Attendance (근태)

```typescript
type AttendanceStatus = "" | "0" | "지" | "결" | "휴";
// "" 빈칸, "0" 정상, "지" 지각, "결" 결근, "휴" 휴무

interface AttendanceEntry {
  driverId: string;
  year: number;
  month: number;            // 1–12
  day: number;              // 1–31
  status: AttendanceStatus;
}

// FE에서는 월별로 묶어서 저장
interface AttendanceMonth {
  id: string;
  driverId: string;
  driverName: string;
  year: number;
  month: number;
  entries: Record<number, AttendanceStatus>;  // day -> status
}
```

**백엔드 권장:** `attendance` 테이블에 `(driver_id, year, month, day)` unique + `status` 컬럼으로 일별 저장

---

### 2.5 Invoice (세금계산서/거래명세서)

```typescript
interface InvoiceItem {
  id: string;
  name: string;       // 품목
  spec: string;       // 규격
  unitPrice: number;  // 단가
  quantity: number;   // 수량
  supplyAmt: number;  // 공급가액
  vatRate: number;    // 부가세율 (%)
  vatAmt: number;     // 부가세액
}

interface Invoice {
  id: string;
  docNo: string;          // 문서번호 (자동 6자리)
  tradeDate: string;      // 거래일자 (YYYY-MM-DD)
  items: InvoiceItem[];
  totalSupply: number;
  totalVat: number;
  totalAmt: number;
  vatIncluded: boolean;   // 부가세 포함 여부
  memo: string;
  type: "tax" | "trade";   // 세금계산서 | 거래명세서
}

interface InvoiceSettings {
  bizNo: string;          // 등록번호(사업자번호)
  companyName: string;
  ceoName: string;
  address: string;
  businessType: string;    // 업태
  businessCategory: string; // 종목
  phone: string;
  itemKorean: boolean;
  specKorean: boolean;
  blankZeroQty: boolean;
  blankZeroSupply: boolean;
  printSpecAsUnit: boolean;
  printTradeDate: boolean;
  noDocNo: boolean;
  printFooter1: boolean;
  printFooter1Text: string;
  printFooter2: boolean;
  printFooter2Text: string;
}
```

---

### 2.6 Settings (요금 설정)

```typescript
interface FareSettings {
  areas: string[];                              // 지역 목록 (최대 10개)
  fares: Record<string, Record<string, number>>; // [출발지][도착지] = 요금(원)
}
```

---

## 3. 권장 DB 스키마 (Prisma 예시)

```prisma
model Customer {
  id           String   @id @default(cuid())
  no           Int      @unique @default(autoincrement())
  registeredAt DateTime
  dmSend       Boolean  @default(false)
  smsSend      Boolean  @default(false)
  category     String
  name         String
  info         String?
  memberNo     String?
  address      String?
  addressDetail String?
  phone        String?
  mobile       String?
  otherPhone   String?
  notes        String?
  referrerId   String?
  referrer     Customer?  @relation("referral", fields: [referrerId], references: [id])
  referrals    Customer[] @relation("referral")
  rides        Ride[]
  createdAt    DateTime @default(now())
}

model Driver {
  id           String   @id @default(cuid())
  no           Int      @unique @default(autoincrement())
  registeredAt DateTime
  name         String
  region       String?
  timeSlot     String?
  address      String?
  addressZip   String?
  addressDetail String?
  phone        String?
  mobile       String?
  licenseNo    String?
  residentNo   String?
  aptitudeTest String?
  notes        String?
  rides        Ride[]
  attendance   Attendance[]
  createdAt    DateTime @default(now())
}

model Ride {
  id           String   @id @default(cuid())
  date         String   // YYYY-MM-DD
  time         String   // HH:mm
  customerName String
  phone        String?
  customerId   String?
  customer     Customer? @relation(fields: [customerId], references: [id])
  driverId     String?
  driver       Driver?   @relation(fields: [driverId], references: [id])
  driverName   String?   // denormalized for display
  pickup       String
  dropoff      String
  fare         Int      @default(0)
  discount     Int      @default(0)
  extra        Int      @default(0)
  total        Int      @default(0)
  note         String?
  createdAt    DateTime @default(now())
}

model Attendance {
  id       String @id @default(cuid())
  driverId String
  driver   Driver @relation(fields: [driverId], references: [id])
  year     Int
  month    Int
  day      Int
  status   String  // "", "0", "지", "결", "휴"
  @@unique([driverId, year, month, day])
}

model Invoice {
  id           String   @id @default(cuid())
  docNo        String   @unique
  tradeDate    String
  type         String   // "tax" | "trade"
  totalSupply  Int
  totalVat     Int
  totalAmt     Int
  vatIncluded  Boolean  @default(false)
  memo         String?
  items        InvoiceItem[]
  createdAt    DateTime @default(now())
}

model InvoiceItem {
  id         String  @id @default(cuid())
  invoiceId  String
  invoice    Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  name       String
  spec       String?
  unitPrice  Int     @default(0)
  quantity   Int     @default(1)
  supplyAmt  Int     @default(0)
  vatRate    Int     @default(10)
  vatAmt     Int     @default(0)
}

model InvoiceSettings {
  id                String @id @default(cuid())
  bizNo             String?
  companyName       String?
  ceoName           String?
  address           String?
  businessType      String?
  businessCategory  String?
  phone             String?
  itemKorean        Boolean @default(true)
  specKorean        Boolean @default(true)
  blankZeroQty      Boolean @default(false)
  blankZeroSupply   Boolean @default(false)
  printSpecAsUnit   Boolean @default(true)
  printTradeDate    Boolean @default(false)
  noDocNo           Boolean @default(false)
  printFooter1      Boolean @default(true)
  printFooter1Text  String?
  printFooter2      Boolean @default(false)
  printFooter2Text  String?
}

model FareSettings {
  id     String @id @default(cuid())
  areas  Json   // string[]
  fares  Json   // Record<string, Record<string, number>>
}
```

---

## 4. 권장 API 엔드포인트

### 4.1 공통

- `GET /health` — 헬스체크
- 인증: JWT Bearer (관리자용, 추후)

---

### 4.2 Customers

| Method | Path | 설명 |
|--------|------|------|
| GET | `/customers` | 목록 (쿼리: `?field=name&q=홍길동`) |
| GET | `/customers/:id` | 단건 조회 |
| GET | `/customers/:id/rides` | 해당 고객 운행 이력 |
| POST | `/customers` | 등록 |
| PUT | `/customers/:id` | 수정 |
| DELETE | `/customers/:id` | 삭제 |

---

### 4.3 Drivers

| Method | Path | 설명 |
|--------|------|------|
| GET | `/drivers` | 목록 |
| GET | `/drivers/:id` | 단건 조회 |
| GET | `/drivers/:id/rides` | 해당 기사 운행 이력 |
| POST | `/drivers` | 등록 |
| PUT | `/drivers/:id` | 수정 |
| DELETE | `/drivers/:id` | 삭제 |

---

### 4.4 Rides (운행 콜)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/rides` | 목록 (쿼리: `?date=2026-03-04`, `?driverName=홍기사`, `?field=phone&q=010`) |
| GET | `/rides/:id` | 단건 조회 |
| POST | `/rides` | 신규 오더 접수 |
| PUT | `/rides/:id` | 수정 (기사 배정 포함) |
| DELETE | `/rides/:id` | 삭제 |
| DELETE | `/rides` | 전체 삭제 (Body: `{ confirm: true }`) |

---

### 4.5 Attendance (근태)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/attendance` | 월별 조회 (`?year=2026&month=3`) |
| POST | `/attendance` | 단일 셀 저장 `{ driverId, year, month, day, status }` |
| PUT | `/attendance/:driverId/:year/:month` | 월 전체 upsert |
| DELETE | `/attendance/:driverId/:year/:month` | 월 전체 삭제 |

---

### 4.6 Invoices (세금계산서)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/invoices` | 목록 |
| GET | `/invoices/:id` | 단건 조회 |
| POST | `/invoices` | 등록 (docNo 자동 생성) |
| PUT | `/invoices/:id` | 수정 |
| DELETE | `/invoices/:id` | 삭제 |
| GET | `/invoices/settings` | 공급자 설정 조회 |
| PUT | `/invoices/settings` | 공급자 설정 저장 |

---

### 4.7 Settings (요금 설정)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/settings/fares` | 지역·요금 행렬 조회 |
| PUT | `/settings/fares` | 지역·요금 행렬 저장 |

---

### 4.8 SMS (문자 발송)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/sms/send` | 문자 발송 `{ recipients: string[], content: string, type: "individual" | "group" }` |

---

## 5. FE 연동 시 환경변수

```env
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
# 또는 개발: http://localhost:5174
```

---

## 6. FE ↔ BE 데이터 흐름 요약

```
[customers] ──┐
              ├──► [rides] ◄── [drivers]
[fareSettings]─┘         │
                         ├──► [statistics] (집계)
[attendance] ────────────┘

[invoices] + [invoiceSettings] → 인쇄/보고
```

---

## 7. 기타 참고

- **ID 형식:** FE에서 `cuid()` 또는 `nanoid` 권장. 현재 FE는 `generateId()` (timestamp+random) 사용
- **번호 필드 (no, docNo):** 자동증가, 백엔드에서 시퀀스 관리
- **날짜/시간:** 문자열 `YYYY-MM-DD`, `HH:mm` (FE 기준)
