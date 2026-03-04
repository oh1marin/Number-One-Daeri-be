# 시스템 아키텍처

> BACKEND_HANDOFF.md 기준 — 관리대장(web-admin) 전용

## 전체 구조도

```
┌─────────────────────────────────────────────────────────────┐
│                   관리자 웹 (web-admin)                        │
│                   Next.js                                    │
└────────────────────────────┬────────────────────────────────┘
                              │
                              │  REST API (localhost:5174)
                              │
┌─────────────────────────────▼────────────────────────────────┐
│                     백엔드 API 서버                            │
│                  Express + TypeScript                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  REST API 라우터                                     │   │
│  │  /dashboard, /customers, /drivers, /rides,          │   │
│  │  /attendance, /invoices, /settings                   │   │
│  └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│  ┌───────────────────────────▼──────────────────────────┐  │
│  │   Prisma ORM → PostgreSQL                             │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
          │
┌─────────▼──────────┐
│    PostgreSQL DB    │
│    (Docker 5432)    │
└────────────────────┘
```

---

## 서버 디렉토리 구조 (ride-be)

```
ride-be/
├── src/
│   ├── routes/
│   │   ├── index.ts        # 라우터 통합
│   │   ├── dashboard.ts
│   │   ├── customers.ts
│   │   ├── drivers.ts
│   │   ├── rides.ts
│   │   ├── attendance.ts
│   │   ├── invoices.ts
│   │   └── settings.ts
│   │
│   ├── lib/
│   │   └── prisma.ts     # Prisma 클라이언트
│   │
│   ├── app.ts
│   └── index.ts          # 서버 진입점
│
├── prisma/
│   └── schema.prisma     # DB 스키마 정의
│
├── docs/                 # 이 문서들
├── .env.example
├── package.json
└── PROJECT.md
```

---

## 데이터 흐름

```
관리자 웹 (FE)              백엔드 API
     │                          │
     │  GET /rides              │
     │  GET /customers           │
     │  GET /drivers             │
     │  POST /rides (콜 입력)     │
     │  PUT /rides/:id (기사 배정)│
     │  GET /attendance          │
     │  GET/POST /invoices       │
     │  GET/PUT /settings/fares  │
     │ ─────────────────────►    │
     │                          │
     │  { success, data }        │
     │ ◄────────────────────    │
```

(인증/JWT는 추후 추가 예정)

---

## 환경 변수 (.env)

```env
# 서버
PORT=5174
NODE_ENV=development

# DB (PostgreSQL)
DATABASE_URL=postgresql://postgres:password@localhost:5432/ride_db
```
