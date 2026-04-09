import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

const ALLOWED_STATUS = new Set(['pending', 'reviewed', 'resolved']);

async function ensureComplaintReplyColumns() {
  // 운영/개발 DB에 마이그레이션이 아직 반영되지 않은 경우를 방어
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "complaints"
      ADD COLUMN IF NOT EXISTS "adminReply" TEXT,
      ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3);
  `);
}

type ReplyMetaRow = { id: string; adminReply: string | null; repliedAt: Date | null };

async function getReplyMetaByIds(ids: string[]): Promise<Map<string, ReplyMetaRow>> {
  if (!ids.length) return new Map();
  const safeRows = await prisma.$queryRaw<ReplyMetaRow[]>`
    SELECT "id", "adminReply", "repliedAt"
    FROM "complaints"
    WHERE "id" = ANY(${ids}::text[])
  `;
  return new Map(safeRows.map((r) => [r.id, r]));
}

function toComplaintResponse(c: {
  id: string;
  userId: string;
  type: string | null;
  content: string;
  rideId: string | null;
  attachments: unknown;
  status: string;
  adminReply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  user?: { id: string; name: string; email: string | null; phone: string | null } | null;
}) {
  const reply = c.adminReply ?? null;
  return {
    id: c.id,
    userId: c.userId,
    type: c.type,
    content: c.content,
    rideId: c.rideId,
    attachments: c.attachments ?? null,
    status: c.status,
    // FE 호환을 위해 여러 키로 응답
    adminReply: reply,
    reply,
    replyText: reply,
    answer: reply,
    response: reply,
    repliedAt: c.repliedAt ?? null,
    createdAt: c.createdAt,
    user: c.user,
  };
}

// GET /admin/complaints?page=&limit=&status=
router.get('/', async (req, res) => {
  try {
    await ensureComplaintReplyColumns();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const statusRaw = req.query.status;
    const status =
      typeof statusRaw === 'string' && statusRaw.trim() ? statusRaw.trim() : undefined;

    const where = status ? { status } : {};

    const [rows, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      }),
      prisma.complaint.count({ where }),
    ]);

    const replyMap = await getReplyMetaByIds(rows.map((r) => r.id));
    const items = rows.map((c) => {
      const m = replyMap.get(c.id);
      return toComplaintResponse({
        ...c,
        adminReply: m?.adminReply ?? null,
        repliedAt: m?.repliedAt ?? null,
      });
    });

    res.json({
      success: true,
      data: { items, total, page, limit },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /admin/complaints/:id
router.get('/:id', async (req, res) => {
  try {
    await ensureComplaintReplyColumns();
    const row = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    if (!row) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    const metaRows = await prisma.$queryRaw<Array<{ adminReply: string | null; repliedAt: Date | null }>>`
      SELECT "adminReply", "repliedAt"
      FROM "complaints"
      WHERE "id" = ${row.id}
      LIMIT 1
    `;
    const meta = metaRows[0] ?? { adminReply: null, repliedAt: null };
    res.json({
      success: true,
      data: toComplaintResponse({
        ...row,
        adminReply: meta.adminReply,
        repliedAt: meta.repliedAt,
      }),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PATCH /admin/complaints/:id — 처리 상태/답변 저장
router.patch('/:id', async (req, res) => {
  try {
    await ensureComplaintReplyColumns();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const statusRaw = body.status;
    const statusProvided = typeof statusRaw === 'string' && statusRaw.trim().length > 0;
    let nextStatus: string | undefined;
    if (statusProvided) {
      nextStatus = String(statusRaw).trim();
      if (!ALLOWED_STATUS.has(nextStatus)) {
        res.status(400).json({ success: false, error: '유효하지 않은 status' });
        return;
      }
    }

    const replyKey = ['adminReply', 'reply', 'replyText', 'answer', 'response'].find(
      (k) => body[k] !== undefined
    );
    const replyProvided = !!replyKey;
    const rawReply = replyProvided ? body[replyKey as string] : undefined;
    const normalizedReply = rawReply == null ? '' : String(rawReply).trim();

    if (!statusProvided && !replyProvided) {
      res.status(400).json({
        success: false,
        error: 'status 또는 답변 필드(adminReply/reply/replyText/answer/response) 중 하나는 필수',
      });
      return;
    }

    const existing = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    await prisma.$executeRaw`
      UPDATE "complaints"
      SET
        "status" = COALESCE(${nextStatus ?? null}, "status"),
        "adminReply" = CASE WHEN ${replyProvided} THEN ${normalizedReply || null} ELSE "adminReply" END,
        "repliedAt" = CASE
          WHEN ${replyProvided} THEN ${normalizedReply ? new Date() : null}
          ELSE "repliedAt"
        END
      WHERE "id" = ${req.params.id}
    `;

    const updated = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });
    if (!updated) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    const metaRows = await prisma.$queryRaw<Array<{ adminReply: string | null; repliedAt: Date | null }>>`
      SELECT "adminReply", "repliedAt"
      FROM "complaints"
      WHERE "id" = ${updated.id}
      LIMIT 1
    `;
    const meta = metaRows[0] ?? { adminReply: null, repliedAt: null };
    res.json({
      success: true,
      data: toComplaintResponse({
        ...updated,
        adminReply: meta.adminReply,
        repliedAt: meta.repliedAt,
      }),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
