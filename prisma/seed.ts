/**
 * 공지사항·이벤트 초기 데이터 시드
 * - 공지: notices 테이블
 * - 앱 이벤트 탭: notices.events(JSON) → GET /events
 *
 * 실행: npm run db:seed
 * (기존 공지가 있으면 중복 방지를 위해 스킵)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type NoticeSeed = {
  title: string;
  content: string;
  badge?: string;
  badgeColor?: string;
  views?: number;
  coverImageUrl?: string;
  events?: Array<{
    title: string;
    date: string;
    desc: string;
    imageUrl?: string;
  }>;
};

const NOTICE_SEEDS: NoticeSeed[] = [
  {
    title: '일등대리 앱 정식 오픈 안내',
    badge: '공지',
    badgeColor: 'bg-red-100 text-red-600',
    views: 128,
    content: `안녕하세요, 일등대리입니다.

스마트폰으로 간편하게 대리운전을 이용하실 수 있는 일등대리 앱이 정식 오픈했습니다.

■ 주요 기능
· 지도에서 출발·도착지 선택 후 바로 호출
· 카드·토스페이·카카오페이 등 다양한 결제
· 마일리지 적립 및 기프티콘 교환
· 친구 추천 이벤트

■ 고객센터
· 전화 접수: 010-2184-8822
· 앱 내 1:1 문의

앞으로도 더 편리한 서비스로 보답하겠습니다.
감사합니다.`,
  },
  {
    title: '마일리지 적립 혜택 안내',
    badge: '안내',
    badgeColor: 'bg-blue-100 text-blue-600',
    views: 86,
    content: `일등대리 마일리지 적립 혜택을 안내드립니다.

■ 신규 가입
· 가입 시 10,000P 지급 (대리 호출 시 사용 가능)

■ 이용 적립
· 등록 카드 결제 시 이용요금의 10% 마일리지 적립
· 전화 접수(010-2184-8822) 이용 시에도 10% 적립

■ 마일리지 사용
· 대리 호출 결제 시 마일리지 사용 가능
· 기프티콘 교환몰에서 상품권 교환 가능

※ 적립·사용 조건은 앱 내 마일리지 화면에서 확인해 주세요.`,
  },
  {
    title: '2026 친구 추천·신규회원 이벤트',
    badge: '이벤트',
    badgeColor: 'bg-amber-100 text-amber-700',
    views: 214,
    content: `일등대리 친구 추천 이벤트가 진행 중입니다!

■ 신규 회원
· 가입 시 10,000P 즉시 지급

■ 추천인 혜택
· 친구가 추천인 등록 시 2,000원 적립
· 친구 2명 추천 달성 시 스타벅스 쿠폰 2장
· 친구 5명 추천 달성 시 교촌치킨 세트 쿠폰

■ 참여 방법
1. 앱 메뉴 → 내추천인 등록 / 내추천인 현황
2. 친구에게 앱 설치 후 가입 안내
3. 친구가 가입 후 추천인 전화번호 등록

※ 이벤트 기간 및 상세 조건은 앱 내 이벤트·쿠폰함을 참고해 주세요.`,
    events: [
      {
        title: '신규 가입 10,000P',
        date: '2026.06.01 ~ 2026.12.31',
        desc: '일등대리 신규 가입 시 10,000P 마일리지를 드립니다. 대리 호출 결제에 사용할 수 있어요.',
      },
      {
        title: '친구 추천 2,000원 적립',
        date: '2026.06.01 ~ 2026.12.31',
        desc: '친구가 내 전화번호로 추천인 등록 시 2,000원이 적립됩니다. 2명·5명 달성 시 추가 쿠폰도 지급!',
      },
      {
        title: '카드 결제 10% 마일리지 적립',
        date: '2026.06.01 ~ 2026.12.31',
        desc: '등록 카드 또는 앱 결제로 이용 시 이용요금의 10%를 마일리지로 적립해 드립니다.',
      },
      {
        title: '기프티콘 교환몰 오픈',
        date: '2026.06.01 ~ 2026.12.31',
        desc: '적립한 마일리지로 스타벅스·치킨 등 다양한 기프티콘을 교환해 보세요.',
      },
    ],
  },
  {
    title: '토스페이먼츠 결제 연동 안내',
    badge: '공지',
    badgeColor: 'bg-red-100 text-red-600',
    views: 52,
    content: `결제 시스템이 토스페이먼츠로 연동되었습니다.

■ 앱 결제
· 카드, 토스페이, 카카오페이 등을 한 화면에서 선택 가능

■ 등록 카드
· 자주 쓰는 카드를 등록해 두면 다음 이용 시 빠르게 결제할 수 있습니다.

■ 안전 결제
· 결제 과정은 토스페이먼츠 보안 환경에서 처리됩니다.

결제 관련 문의는 앱 내 1:1 문의 또는 고객센터(010-2184-8822)로 연락해 주세요.`,
  },
  {
    title: '대리운전 이용 시 유의사항',
    badge: '안내',
    badgeColor: 'bg-gray-100 text-gray-600',
    views: 41,
    content: `안전하고 원활한 이용을 위해 아래 사항을 확인해 주세요.

■ 호출 전
· 출발지·도착지를 정확히 입력해 주세요.
· 차량 위치·주차 상태를 기사님께 알려 주시면 원활합니다.

■ 이용 중
· 기사님과의 연락은 앱 또는 등록된 연락처를 이용해 주세요.
· 음주운전 대신 대리운전을 이용해 주세요.

■ 결제·마일리지
· 결제 완료 후 이용내역·영수증은 앱에서 확인할 수 있습니다.
· 마일리지·쿠폰 사용 조건은 각 화면 안내를 참고해 주세요.

불편 사항은 앱 내 불편신고 또는 1:1 문의로 접수해 주세요.`,
  },
];

async function main() {
  const existing = await prisma.notice.count();
  if (existing > 0) {
    console.log(`[seed] notices 테이블에 ${existing}건 존재 — 시드 스킵 (강제 실행: FORCE_SEED=1)`);
    if (process.env.FORCE_SEED !== '1') return;
    console.log('[seed] FORCE_SEED=1 — 추가 시드 진행');
  }

  for (const seed of NOTICE_SEEDS) {
    const dup = await prisma.notice.findFirst({
      where: { title: seed.title },
      select: { id: true },
    });
    if (dup) {
      console.log(`[seed] skip (exists): ${seed.title}`);
      continue;
    }

    await prisma.notice.create({
      data: {
        title: seed.title,
        content: seed.content,
        badge: seed.badge ?? '공지',
        badgeColor: seed.badgeColor ?? 'bg-red-100 text-red-600',
        views: seed.views ?? 0,
        ...(seed.coverImageUrl ? { coverImageUrl: seed.coverImageUrl } : {}),
        ...(seed.events?.length ? { events: seed.events } : {}),
      },
    });
    console.log(`[seed] created: ${seed.title}`);
  }

  const total = await prisma.notice.count();
  console.log(`[seed] done — notices total: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
