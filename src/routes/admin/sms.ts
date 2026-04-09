import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { sendSms } from '../../lib/sms';
import { fetchSolapiMessageList, type SolapiListParams } from '../../lib/sms';

const router = Router();

// POST /admin/sms/send
// - 단건 번호: { phone: "010..." (숫자만 허용 아님 — 서버에서 정규화), message }
// - 지정 회원: { ids: string[], message }
// - 전체(수신동의·전화있는 회원): { sendAll: true, message }
router.post('/send', async (req, res) => {
  try {
    const { ids, message, sendAll, phone: phoneRaw } = req.body ?? {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ success: false, error: 'message 필수' });
      return;
    }
    const text = message.trim();

    // 1) 단건 전화 — userId 없이 번호만 알 때 (불편사항 답장 등)
    const phoneDigits =
      phoneRaw != null && String(phoneRaw).trim()
        ? String(phoneRaw).replace(/\D/g, '')
        : '';
    if (phoneDigits.length >= 10) {
      const optRows = await prisma.$queryRaw<Array<{ settings: unknown }>>`
        SELECT "settings"
        FROM users
        WHERE "deletedAt" IS NULL
          AND "phone" IS NOT NULL
          AND regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') = ${phoneDigits}
        LIMIT 1
      `;
      const settings = (optRows[0]?.settings as Record<string, unknown> | undefined) ?? undefined;
      if (settings?.smsOptOut === true) {
        res.status(400).json({ success: false, error: '해당 번호 회원은 SMS 수신 거부 상태입니다.' });
        return;
      }
      try {
        const ok = await sendSms(phoneDigits, text);
        res.json({
          success: true,
          data: { sent: ok ? 1 : 0, total: 1, failed: ok ? 0 : 1 },
        });
      } catch (err) {
        res.status(400).json({ success: false, error: String(err) });
      }
      return;
    }

    const where: { deletedAt: null; id?: { in: string[] }; phone: { not: null } } = {
      deletedAt: null,
      phone: { not: null },
    };
    if (!sendAll) {
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({
          success: false,
          error: 'ids 배열, sendAll: true, 또는 phone(10자리 이상) 필수',
        });
        return;
      }
      where.id = { in: ids as string[] };
    }
    const users = await prisma.user.findMany({
      where,
      select: { id: true, phone: true, settings: true },
    });
    const withPhone = users.filter((u) => {
      if (!u.phone || u.phone.replace(/\D/g, '').length < 10) return false;
      const settings = (u.settings as Record<string, unknown>) ?? {};
      if (settings.smsOptOut === true) return false; // 수신거부 시 제외
      return true;
    });
    let sent = 0;
    for (const u of withPhone) {
      try {
        if (u.phone && (await sendSms(u.phone, text))) sent++;
      } catch {
        // 건너뜀
      }
    }
    res.json({
      success: true,
      data: { sent, total: withPhone.length, failed: withPhone.length - sent },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /admin/sms/messages — 솔라피 메시지 목록 조회 (SMS_SERVICE=solapi 일 때만)
router.get('/messages', async (req, res) => {
  try {
    if (process.env.SMS_SERVICE !== 'solapi') {
      res.status(400).json({
        success: false,
        error: 'SMS_SERVICE가 solapi일 때만 메시지 목록 조회가 가능합니다.',
      });
      return;
    }

    const params: SolapiListParams = {};
    const q = req.query;

    if (q.messageId) params.messageId = String(q.messageId);
    if (q.groupId) params.groupId = String(q.groupId);
    if (q.to) params.to = String(q.to);
    if (q.from) params.from = String(q.from);
    if (q.type) params.type = String(q.type);
    if (q.dateCreated) params.dateCreated = String(q.dateCreated);
    if (q.dateUpdated) params.dateUpdated = String(q.dateUpdated);
    if (q.dateType) params.dateType = q.dateType as 'CREATED' | 'UPDATED';
    if (q.startDate) params.startDate = String(q.startDate);
    if (q.endDate) params.endDate = String(q.endDate);
    if (q.startKey) params.startKey = String(q.startKey);
    if (q.limit) params.limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    if (q.criteria) params.criteria = String(q.criteria);
    if (q.cond) params.cond = String(q.cond);
    if (q.value) params.value = String(q.value);

    const result = await fetchSolapiMessageList(params);

    res.json({
      success: true,
      data: {
        list: result.list,
        nextKey: result.nextKey,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
