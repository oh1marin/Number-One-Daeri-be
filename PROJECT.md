# RIDE — 라이드 헤일링 서비스 프로젝트

## 프로젝트 개요

카카오택시 / 우버 구조를 참고한 라이드 헤일링 풀스택 포트폴리오 프로젝트.
고객 앱, 기사 앱, 관리자 웹, 백엔드 API 4개 파트로 구성된다.

포트폴리오 핵심 어필 포인트:
- 배차 로직 설계 (가장 가까운 기사 매칭)
- 상태머신 기반 운행 상태 동기화
- 취소/패널티 규칙 처리
- 정산 수수료 계산
- 결제 실패 재처리 로직

---

## 기술 스택

| 파트 | 기술 |
|------|------|
| 백엔드 API | Node.js + Express + TypeScript |
| ORM | Prisma |
| DB | PostgreSQL |
| 실시간 | Socket.io |
| 캐시 | Redis |
| 관리자 웹 | Next.js + TypeScript + Tailwind CSS |
| 고객 앱 | Flutter |
| 기사 앱 | Flutter |
| 지도 | Kakao Maps SDK (앱) / Kakao Maps JS API (웹) |
| 결제 | PortOne (아임포트) PG 연동 |
| 인증 | JWT (Access Token + Refresh Token) |
| 파일 스토리지 | AWS S3 또는 Cloudinary |

---

## 레포지토리 구조

```
ride-be/          ← 이 레포 (백엔드 API 서버)
ride-admin/       ← 관리자 웹 (Next.js)
ride-customer/    ← 고객 앱 (Flutter)
ride-driver/      ← 기사 앱 (Flutter)
```

백엔드가 모든 비즈니스 로직의 중심이다.
앱/웹은 API를 호출하는 클라이언트에 불과하다.

---

## 문서 목록

| 문서 | 경로 | 설명 |
|------|------|------|
| 프로젝트 개요 | `PROJECT.md` | 이 파일 |
| 시스템 아키텍처 | `docs/ARCHITECTURE.md` | 전체 구조도, 서버 구성 |
| 도메인 & 상태머신 | `docs/DOMAIN.md` | 운행 라이프사이클, 상태 전이 규칙 |
| API 명세 | `docs/API.md` | 전체 REST API 엔드포인트 |
| DB 스키마 | `docs/SCHEMA.md` | Prisma 스키마 + ERD 설명 |
| 비즈니스 로직 | `docs/BUSINESS_RULES.md` | 요금, 수수료, 패널티, 정산 규칙 |

---

## 핵심 도메인 객체

```
User (고객)
Driver (기사)
Ride (운행)
Payment (결제)
Mileage (마일리지/포인트)
Settlement (정산)
Inquiry (문의)
Notice (공지사항)
```

---

## 개발 순서 계획

### 1단계 — 백엔드 코어
- [ ] DB 스키마 설계 (Prisma)
- [ ] 인증 API (회원가입, 로그인, 토큰 갱신)
- [ ] 운행 API (호출, 배차, 상태 변경, 완료, 취소)
- [ ] 결제 API (PG 연동, 검증, 실패 재처리)
- [ ] 마일리지 API
- [ ] 문의 API

### 2단계 — 실시간
- [ ] Socket.io 서버 설정
- [ ] 기사 위치 실시간 전송
- [ ] 운행 상태 실시간 동기화 (고객 ↔ 기사 ↔ 관리자)

### 3단계 — 관리자 웹
- [ ] 대시보드 (실시간 콜 현황)
- [ ] 기사 관리 (승인, 정지)
- [ ] 운행 관리 (로그, 분쟁 처리)
- [ ] 정산 관리
- [ ] CS 관리 (문의 처리)

### 4단계 — 앱
- [ ] 고객 앱 Flutter
- [ ] 기사 앱 Flutter
