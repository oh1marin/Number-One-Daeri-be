import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

/**
 * Notice.events[].date 문자열을 EventItem의 startAt/endAt 문자열로 대략 변환합니다.
 * 예)
 * - 2026.11.20
 * - 2026.12.01 ~ 12.31
 * - 2026.12.24 ~ 2027.01.02
 */
function parseNoticeEventDateRange(dateRaw: unknown): { startAt: string | null; endAt: string | null } {
  const s = String(dateRaw ?? '').trim();
  if (!s) return { startAt: null, endAt: null };

  // 날짜 부분 분리: "~" 기준
  const parts = s.split('~').map((x) => x.trim()).filter(Boolean);

  const parseYmd = (part: string, baseYear?: number): Date | null => {
    const normalized = part.replace(/\./g, '-').replace(/\//g, '-').replace(/\s/g, '');
    // YYYY-MM-DD
    const m1 = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m1) {
      const y = Number(m1[1]);
      const m = Number(m1[2]);
      const d = Number(m1[3]);
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
      return new Date(y, m - 1, d);
    }
    // MM-DD (연도 생략)
    const m2 = normalized.match(/^(\d{1,2})-(\d{1,2})$/);
    if (m2) {
      if (!baseYear) return null;
      const y = baseYear;
      const m = Number(m2[1]);
      const d = Number(m2[2]);
      if (!Number.isFinite(m) || !Number.isFinite(d)) return null;
      return new Date(y, m - 1, d);
    }
    return null;
  };

  // 단일 날짜: start=end
  if (parts.length === 1) {
    const start = parseYmd(parts[0]);
    if (!start) return { startAt: null, endAt: null };
    const v = formatYmd(start);
    return { startAt: v, endAt: v };
  }

  const startPart = parts[0];
  const endPart = parts[1];
  const startDate = parseYmd(startPart);
  if (!startDate) return { startAt: null, endAt: null };

  const baseYear = startDate.getFullYear();
  const endDate = parseYmd(endPart, baseYear) ?? startDate;

  return { startAt: formatYmd(startDate), endAt: formatYmd(endDate) };
}

function normalizeNoticeEvents(eventsRaw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(eventsRaw)) {
    return eventsRaw.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>;
  }

  // JSON 컬럼이 문자열로 저장/전달되는 케이스 방어
  if (typeof eventsRaw === 'string') {
    try {
      const parsed = JSON.parse(eventsRaw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>;
      }
    } catch {
      // ignore
    }
  }

  // 혹시 { events: [...] } 형태로 내려오는 경우
  if (eventsRaw && typeof eventsRaw === 'object') {
    const maybe = (eventsRaw as Record<string, unknown>).events;
    if (Array.isArray(maybe)) {
      return maybe.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>;
    }
  }

  return [];
}

// GET /events
router.get('/', async (req, res) => {
  try {
    // 앱 기준: 이벤트는 events 테이블이 아니라 notices.events(JSON 배열)에서 정의된다고 가정합니다.
    // (docs/FE_공지사항_Flutter_연동.md 스펙)
    const includeExpired = req.query.includeExpired === '1' || req.query.includeExpired === 'true';
    const now = new Date();

    const notices = await prisma.notice.findMany({
      select: { id: true, title: true, events: true },
      orderBy: { createdAt: 'desc' },
    });

    const flattened: Array<{
      id: string;
      title: string;
      imageUrl?: string | null;
      startAt?: string | null;
      endAt?: string | null;
      url?: string | null;
    }> = [];

    for (const n of notices) {
      const list = normalizeNoticeEvents(n.events);
      list.forEach((e, idx) => {
        const rawTitle = String(e?.title ?? '').trim();
        const rawDate = String(e?.date ?? '').trim();
        const rawDesc = String((e as any)?.desc ?? '').trim();

        // 관리자가 events 항목을 안 채우고 저장했을 때처럼
        // title/date/desc가 모두 빈 placeholder면 Flutter에 이벤트 카드가 뜨지 않게 스킵한다.
        const hasAnyField = rawTitle.length > 0 || rawDate.length > 0 || rawDesc.length > 0;
        if (!hasAnyField) return;

        // title이 비어있으면 공지(Notice) 제목을 물려주면 "공지사항이 섞여 보이는" 느낌이 생겨서,
        // 이벤트 단독 fallback으로만 처리한다.
        const title = rawTitle || `Event ${idx + 1}`;

        const { startAt, endAt } = parseNoticeEventDateRange(e?.date);

        // 만료 필터(대략): endAt이 ISO 문자열 형태로 들어오면 Date로 비교
        if (!includeExpired && endAt) {
          const endDate = new Date(endAt);
          if (Number.isFinite(endDate.getTime()) && endDate.getTime() < now.getTime()) return;
        }

        flattened.push({
          id: `${n.id}:${idx}`,
          title,
          imageUrl: null,
          startAt,
          endAt,
          url: null,
        });
      });
    }

    // startAt이 있는 것 우선 정렬(문자열 y-m-d 기준)
    flattened.sort((a, b) => {
      const as = a.startAt ?? '';
      const bs = b.startAt ?? '';
      return as.localeCompare(bs);
    });

    res.json({ success: true, data: flattened });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
