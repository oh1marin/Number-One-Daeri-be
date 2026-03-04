# API 명세

> BACKEND_HANDOFF.md 기준 — 관리대장(web-admin) FE 연동용

---

## Base URL

```
http://localhost:5174/api/v1
```

---

## 공통

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 헬스체크 |
| GET | `/api/v1` | API 정보 |

---

## Dashboard

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/dashboard` | 건수·매출 요약, 오늘 콜, 최근 내역, 기사별 현황 |

---

## Customers

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/customers` | 목록 (?field=name&q=홍길동) |
| GET | `/api/v1/customers/:id` | 단건 조회 |
| GET | `/api/v1/customers/:id/rides` | 해당 고객 운행 이력 |
| POST | `/api/v1/customers` | 등록 |
| PUT | `/api/v1/customers/:id` | 수정 |
| DELETE | `/api/v1/customers/:id` | 삭제 |

---

## Drivers

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/drivers` | 목록 |
| GET | `/api/v1/drivers/:id` | 단건 조회 |
| GET | `/api/v1/drivers/:id/rides` | 해당 기사 운행 이력 |
| POST | `/api/v1/drivers` | 등록 |
| PUT | `/api/v1/drivers/:id` | 수정 |
| DELETE | `/api/v1/drivers/:id` | 삭제 |

---

## Rides (운행 콜)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/rides` | 목록 (?date=2026-03-04&driverName=홍기사&field=phone&q=010) |
| GET | `/api/v1/rides/:id` | 단건 조회 |
| POST | `/api/v1/rides` | 신규 오더 접수 |
| PUT | `/api/v1/rides/:id` | 수정 (기사 배정 포함) |
| DELETE | `/api/v1/rides/:id` | 삭제 |
| DELETE | `/api/v1/rides` | 전체 삭제 (Body: `{ confirm: true }`) |

---

## Attendance (근태)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/attendance` | 월별 조회 (?year=2026&month=3) |
| POST | `/api/v1/attendance` | 단일 셀 저장 |
| PUT | `/api/v1/attendance/:driverId/:year/:month` | 월 전체 upsert |
| DELETE | `/api/v1/attendance/:driverId/:year/:month` | 월 전체 삭제 |

---

## Invoices (세금계산서)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/invoices` | 목록 |
| GET | `/api/v1/invoices/:id` | 단건 조회 |
| GET | `/api/v1/invoices/settings` | 공급자 설정 조회 |
| POST | `/api/v1/invoices` | 등록 (docNo 자동 생성) |
| PUT | `/api/v1/invoices/:id` | 수정 |
| PUT | `/api/v1/invoices/settings` | 공급자 설정 저장 |
| DELETE | `/api/v1/invoices/:id` | 삭제 |

---

## Settings (요금 설정)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/settings/fares` | 지역·요금 행렬 조회 |
| PUT | `/api/v1/settings/fares` | 지역·요금 행렬 저장 |

---

## SMS (추후)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/sms/send` | 문자 발송 (미구현) |

---

## 응답 포맷

```json
{
  "success": true,
  "data": { ... }
}
```

```json
{
  "success": false,
  "error": "Error message"
}
```
