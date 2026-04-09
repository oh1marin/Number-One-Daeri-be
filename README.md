# 일등대리 백엔드 (ride-be)

대리운전 앱 **일등대리**의 백엔드 API 서버입니다.  
Flutter 앱, 기사 앱, 관리대장(web-admin) 세 클라이언트를 지원합니다.

---

## 기술 스택

| 구성 | 내용 |
|------|------|
| 런타임 | Node.js + TypeScript |
| 프레임워크 | Express |
| ORM | Prisma (PostgreSQL) |
| 인증 | JWT (Access/Refresh Token) |
| 실시간 | Socket.IO |
| 결제 | PortOne (빌링키 카드결제) |
| 지오코딩 | Kakao Map REST API |
| SMS | AWS Pinpoint SMS |
| 이메일 | Nodemailer (SMTP) |
| AI | OpenAI GPT-4o-mini |

---

## 시작하기

### 1. 패키지 설치

```bash
npm install
```

### 2. 환경 변수 설정

```bash
copy .env.example .env
```

`.env`에서 아래 항목을 실제 값으로 수정합니다.

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | JWT 서명 키 (32자 이상 권장) |
| `KAKAO_REST_API_KEY` | 카카오 역지오코딩 |
| `SMTP_*` / `CONTACT_EMAIL` | 상담문의 이메일 발송 |
| `PORTONE_API_KEY` / `PORTONE_API_SECRET` | PortOne 결제 |
| `PORTONE_STORE_ID` / `PORTONE_CHANNEL_KEY` | PortOne 스토어/채널 |
| `OPENAI_API_KEY` | AI 자동답변 |

### 3. DB 마이그레이션

```bash
npm run db:migrate
```

스키마만 바로 반영(개발용):

```bash
npm run db:push
```

### 4. 관리자 계정 생성

```bash
npm run create-admin
```

### 5. 개발 서버 실행

```bash
npm run dev
```

서버: `http://localhost:5174`

---

## 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 (ts-node-dev, 자동 재시작) |
| `npm run build` | TypeScript 빌드 (`dist/`) |
| `npm run start` | 빌드된 서버 실행 |
| `npm run db:generate` | Prisma Client 재생성 |
| `npm run db:push` | 스키마를 DB에 직접 반영 |
| `npm run db:migrate` | 마이그레이션 생성 및 실행 |
| `npm run db:studio` | Prisma Studio (DB GUI) |
| `npm run create-admin` | 관리자 계정 생성 스크립트 |

---

## API 구조

Base URL: `http://localhost:5174/api/v1`

### 앱 (Flutter) — `/api/v1/*`

| 경로 | 설명 |
|------|------|
| `/auth` | 이메일/전화번호 회원가입·로그인·토큰 갱신 |
| `/app/auth` | 앱 전용 인증 (전화번호 OTP) |
| `/app/users` | 내 정보 조회·수정·탈퇴 |
| `/app/rides` | 콜 요청·진행 중 콜·이용내역 |
| `/app/mileage` | 마일리지 잔액·적립/사용 이력 |
| `/app/withdrawals` | 마일리지 출금 신청·이력 |
| `/app/cards` | 결제 카드 등록·삭제 |
| `/app/payments` | 카드 결제·결제 내역 |
| `/app/coupons` | 쿠폰 등록·사용 |
| `/app/referrals` | 추천인 코드 입력·추천 현황 |
| `/app/notices` | 공지사항 목록·상세 |
| `/app/events` | 이벤트 목록 |
| `/app/inquiries` | 1:1 문의 등록·메시지 |
| `/app/complaints` | 불편신고 접수 (첨부파일 포함) |
| `/app/faqs` | 자주 묻는 질문 |
| `/app/ads` | 광고 배너 |
| `/app/geocode` | 주소 → 좌표 변환 (Kakao) |
| `/app/banks` | 은행 코드 목록 |
| `/app/contact` | 비로그인 상담문의 |
| `/app/ai/chat` | AI 자동답변 (GPT-4o-mini) |

### 기사 앱 — `/api/v1/driver/*`

| 경로 | 설명 |
|------|------|
| `/driver/auth` | 기사 로그인·토큰 갱신 |
| `/driver/rides` | 콜 수락·완료·취소·이력 |
| `/driver/location` | 실시간 위치 업데이트 |

### 관리대장 (web-admin) — `/api/v1/admin/*`

| 경로 | 설명 |
|------|------|
| `/admin/auth` | 관리자 로그인·회원가입 |
| `/admin/me` | 관리자 내 정보·권한 |
| `/admin/dashboard` | 건수·매출 요약 |
| `/admin/users` | 앱 회원 목록·상세·마일리지 조작 |
| `/admin/rides` | 운행 콜 목록·상태 변경 |
| `/admin/complaints` | 불편신고 목록·처리·관리자 답변 |
| `/admin/inquiries` | 1:1 문의 목록·답변 |
| `/admin/coupons` | 쿠폰 발급·조회·예산 충전 |
| `/admin/mileage` | 마일리지 적립/차감 이력 |
| `/admin/withdrawals` | 출금 신청 승인·거절 |
| `/admin/notices` | 공지사항 CRUD |
| `/admin/faqs` | FAQ CRUD |
| `/admin/accumulation` | 마일리지 적립 설정 |
| `/admin/ads` | 광고 배너 관리 |
| `/admin/sms` | SMS 수동 발송 |
| `/admin/number-change` | 스팸해결사 번호변경 등록·조회 |
| `/admin/counselors` | 상담원 계정 관리 |
| `/admin/app-install` | 앱 설치 통계 |
| `/admin/order-stats` | 주문 통계 |
| `/admin/recommendation-kings` | 추천왕 현황 |
| `/admin/referrals` | 추천인 이력 |
| `/admin/card-payments` | 카드 결제 내역 |

---

## 실시간 (Socket.IO)

경로: `ws://localhost:5174/socket.io`

연결 시 `auth.token`에 Access Token을 전달해야 합니다.

| 이벤트 | 방향 | 설명 |
|--------|------|------|
| `ride:join` | 클라이언트 → 서버 | 특정 콜 룸 구독 |
| `ride:status` | 서버 → 클라이언트 | 콜 상태 변경 알림 |
| `driver:location` | 서버 → 클라이언트 | 기사 위치 실시간 전달 |

---

## 주요 데이터 모델

```
User          앱 회원 (마일리지, 카드, 콜 이력)
Driver        기사 (위치, 근태, 콜 이력)
Admin         관리자
Ride          운행 콜 (pending → accepted → driving → completed | cancelled)
Payment       결제 내역 (PortOne 연동)
MileageHistory 마일리지 적립/사용/출금/이전 이력
Coupon        쿠폰 코드 (마일리지 적립용)
CouponBudget  쿠폰 예산 잔액 (관리자 충전)
UserReferral  추천인 관계 및 보상
Complaint     불편신고 (첨부파일, 관리자 답변 포함)
UserInquiry   1:1 문의 (메시지 스레드)
Notice        공지사항 (배지, 이벤트 일정)
NumberChange  스팸해결사 번호변경 대장
```

---

## 마일리지 정책

| 항목 | 내용 |
|------|------|
| 신규 가입 | 10,000원 즉시 지급 |
| 대리 이용 | 요금의 10% 적립 |
| 친구 추천 등록 | 추천인 2,000원 지급 |
| 피추천인 첫 이용 | 추천인 3,000원 추가 지급 |
| 출금 조건 | 20,000원 이상, 10,000원 단위, 수수료 500원 |

---

## AI 자동답변 (`/app/ai/chat`)

OpenAI `gpt-4o-mini`를 이용한 고객센터 1차 자동답변 기능입니다.

- 민감 키워드(사고, 폭행, 법적조치 등) 감지 시 `needs_human_handoff: true` 반환
- 응답 JSON: `reply_text`, `category`, `confidence`, `needs_human_handoff`, `suggested_status`
- 답변 최대 220자, 이모지 없음, 한국어 전용

---

## 디렉토리 구조

```
src/
├── index.ts              서버 진입점
├── app.ts                Express 앱 설정
├── middleware/
│   ├── auth.ts           관리자 JWT 인증
│   ├── userAuth.ts       앱 사용자 JWT 인증
│   └── driverAuth.ts     기사 JWT 인증
├── routes/
│   ├── app/              Flutter 앱 API
│   ├── admin/            관리대장 API
│   ├── driver/           기사 앱 API
│   ├── appAuth.ts        앱 인증 (OTP)
│   ├── driverAuth.ts     기사 인증
│   └── auth.ts           공통 인증
├── services/
│   ├── matchingService.ts  기사 배차 로직
│   └── rideMileageOnComplete.ts  콜 완료 시 마일리지 적립
├── socket/
│   └── index.ts          Socket.IO 설정
├── lib/
│   ├── portone.ts        PortOne 결제 연동
│   ├── kakao.ts          카카오 지오코딩
│   ├── sms.ts            AWS Pinpoint SMS
│   └── email.ts          Nodemailer 이메일
└── utils/
    ├── jwt.ts            JWT 유틸
    └── geo.ts            거리 계산 유틸
prisma/
├── schema.prisma         DB 스키마
└── migrations/           마이그레이션 이력
scripts/
├── create-admin.ts       관리자 계정 생성
├── create-promo-coupons.ts  프로모션 쿠폰 일괄 생성
└── set-promo-coupons-validUntil-1y.ts  쿠폰 유효기간 1년 연장
```

---

## 마이그레이션 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-18 | NumberChange (스팸해결사 번호변경 대장) 추가 |
| 2026-03-18 | Payment, UserCard 테이블 추가 (카드 결제) |
| 2026-03-18 | CouponBudget 테이블 추가 (쿠폰 예산 관리) |
| 2026-03-19 | Ride 호출 옵션 필드 추가 (transmission, serviceType, quickBoard, vehicleType) |
| 2026-03-19 | AccumulationSettings에 rideEarnRate 필드 추가 (대리 이용 적립률) |
| 2026-03-20 | Notice 필드 추가 (badge, badgeColor, events) |
| 2026-03-26 | Complaint attachments 필드 추가 (불편신고 첨부파일) |
| 2026-03-27 | Complaint adminReply, repliedAt 필드 추가 (관리자 답변) |
