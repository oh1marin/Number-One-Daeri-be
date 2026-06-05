export type NoticeEventPayload = {
  title: string;
  date: string;
  desc: string;
  imageUrl?: string;
};

export type NoticeRow = {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  badge?: string | null;
  badgeColor?: string | null;
  views: number;
  coverImageUrl?: string | null;
  events?: unknown;
};

function normalizeEventsRaw(eventsRaw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(eventsRaw)) {
    return eventsRaw.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>;
  }
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
  return [];
}

export function mapNoticeEvents(eventsRaw: unknown): NoticeEventPayload[] {
  return normalizeEventsRaw(eventsRaw)
    .map((e) => {
      const title = String(e.title ?? '').trim();
      const date = String(e.date ?? '').trim();
      const desc = String(e.desc ?? '').trim();
      const imageUrl = String(e.imageUrl ?? e.coverImageUrl ?? e.thumbnailUrl ?? '').trim();
      const out: NoticeEventPayload = { title, date, desc };
      if (imageUrl) out.imageUrl = imageUrl;
      return out;
    })
    .filter((e) => e.title || e.date || e.desc || e.imageUrl);
}

/** 공지 API 응답 포맷 (관리자·앱 공용) */
export function formatNotice(n: NoticeRow) {
  const date = n.createdAt.toISOString().slice(0, 10).replace(/-/g, '.');
  const events = mapNoticeEvents(n.events);
  const cover = String(n.coverImageUrl ?? '').trim();
  return {
    id: n.id,
    badge: n.badge ?? '공지',
    badgeColor: n.badgeColor ?? 'bg-red-100 text-red-600',
    title: n.title,
    date,
    views: n.views ?? 0,
    content: n.content,
    ...(cover ? { coverImageUrl: cover } : {}),
    events,
  };
}
