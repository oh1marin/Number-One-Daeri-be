# DB 스키마 (Prisma)

> BACKEND_HANDOFF.md 기준 — 관리대장(web-admin) 전용

---

## ERD 개요

```
Customer ──────── Ride ──────── Driver
   │                 │              │
   └── referrer     │              └── Attendance
                    │
Invoice ─── InvoiceItem

InvoiceSettings (싱글톤)
FareSettings (싱글톤)
```

---

## 모델 상세

### Customer (고객)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | cuid | PK |
| no | Int (auto) | 고객번호 (자동증가) |
| registeredAt | Date | 등록일자 |
| dmSend | Boolean | D.M 발송 |
| smsSend | Boolean | 문자발송 |
| category | String | 고객분류 |
| name | String | 고객성명 |
| info | String? | 고객정보 |
| memberNo | String? | 회원번호 |
| address | String? | 주소 |
| addressDetail | String? | 상세주소 |
| phone | String? | 전화번호 |
| mobile | String? | 휴대폰 |
| otherPhone | String? | 기타전화 |
| notes | String? | 기타사항 |
| referrerId | String? | 추천인 Customer ID |

**고객분류:** 동창, 직장동료, 지인, 거래처, 일반회원, 종신회원, 특별회원, 친지가족, 매입처, 매출처, 본인

---

### Driver (기사)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | cuid | PK |
| no | Int (auto) | 관리번호 |
| registeredAt | Date | 등록일자 |
| name | String | 성명 |
| region | String? | 담당지역 |
| timeSlot | String? | 시간대 |
| address | String? | 주소 |
| addressZip | String? | 우편번호 |
| addressDetail | String? | 상세주소 |
| phone | String? | 전화번호 |
| mobile | String? | 휴대폰 |
| licenseNo | String? | 면허번호 |
| residentNo | String? | 주민번호 |
| aptitudeTest | String? | 적성검사 |
| notes | String? | 비고 |

---

### Ride (운행 콜)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | cuid | PK |
| date | String | YYYY-MM-DD |
| time | String | HH:mm |
| customerName | String | 고객명/업소명 |
| phone | String? | 연락처 |
| customerId | String? | Customer FK (선택) |
| driverId | String? | Driver FK |
| driverName | String? | 기사명 (denormalized) |
| pickup | String | 출발지 |
| dropoff | String | 도착지 |
| fare | Int | 요금 |
| discount | Int | 할인금액 |
| extra | Int | 추가금액 |
| total | Int | 금액합계 |
| note | String? | 비고 |

**계산:** `total = fare + extra - discount`

---

### Attendance (근태)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | cuid | PK |
| driverId | String | Driver FK |
| year | Int | 연도 |
| month | Int | 월 (1-12) |
| day | Int | 일 (1-31) |
| status | String | "", "0", "지", "결", "휴" |

**Unique:** (driverId, year, month, day)

| status | 의미 |
|--------|------|
| "" | 빈칸 |
| "0" | 정상 |
| "지" | 지각 |
| "결" | 결근 |
| "휴" | 휴무 |

---

### Invoice (세금계산서/거래명세서)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | cuid | PK |
| docNo | String | 문서번호 (6자리) |
| tradeDate | String | YYYY-MM-DD |
| type | String | "tax" \| "trade" |
| totalSupply | Int | 공급가액 합계 |
| totalVat | Int | 부가세액 합계 |
| totalAmt | Int | 총금액 |
| vatIncluded | Boolean | 부가세 포함 여부 |
| memo | String? | 메모 |

### InvoiceItem

| 필드 | 타입 | 설명 |
|------|------|------|
| id | cuid | PK |
| invoiceId | String | Invoice FK |
| name | String | 품목 |
| spec | String? | 규격 |
| unitPrice | Int | 단가 |
| quantity | Int | 수량 |
| supplyAmt | Int | 공급가액 |
| vatRate | Int | 부가세율 (%) |
| vatAmt | Int | 부가세액 |

---

### InvoiceSettings (싱글톤)

공급자 정보 및 인쇄 옵션. 단일 행만 유지.

---

### FareSettings (싱글톤)

| 필드 | 타입 | 설명 |
|------|------|------|
| areas | Json | string[] — 지역 목록 (최대 10개) |
| fares | Json | Record<출발지, Record<도착지, 요금>> |

---

## 인덱스

| 테이블 | 인덱스 |
|--------|--------|
| customers | name, phone, category, registeredAt |
| drivers | name, region, registeredAt |
| rides | date, customerId, driverId, customerName, driverName, pickup, dropoff |
| attendance | (driverId, year, month, day) unique, year+month |
| invoices | tradeDate, type |
