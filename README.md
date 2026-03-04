# RIDE Backend API

## 시작하기

### 1. 환경 변수 설정

```bash
copy .env.example .env
```

`.env` 파일에서 `DATABASE_URL`를 본인 PostgreSQL 연결 정보로 수정하세요.

```
DATABASE_URL="postgresql://user:password@localhost:5432/ride_db"
```

### 2. DB 마이그레이션

```bash
npm run db:push
```

또는 마이그레이션 파일을 생성하려면:

```bash
npm run db:migrate
```

### 3. 개발 서버 실행

```bash
npm run dev
```

서버: `http://localhost:5174`

---

## 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 (ts-node-dev) |
| `npm run build` | TypeScript 빌드 |
| `npm run start` | 빌드된 서버 실행 |
| `npm run db:generate` | Prisma Client 생성 |
| `npm run db:push` | 스키마를 DB에 반영 |
| `npm run db:migrate` | 마이그레이션 생성 및 실행 |
| `npm run db:studio` | Prisma Studio (DB GUI) |
