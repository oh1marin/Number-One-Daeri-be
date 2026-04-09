import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

/** 목록용 마스킹 (예: 01012345678 → 010****5678) */
function maskIdentifier(digits: string): string {
  const d = onlyDigits(digits);
  if (d.length < 7) return d.replace(/(?<=^.).(?=$)/g, '*');
  return `${d.slice(0, 3)}****${d.slice(-4)}`;
}

function validateIdentifier(type: string, digits: string): string | null {
  if (!digits) return 'identifier는 숫자만 입력해 주세요.';
  if (type === 'phone') {
    if (digits.length < 10 || digits.length > 11) return '휴대폰 번호 형식을 확인해 주세요.';
    return null;
  }
  if (type === 'biz') {
    if (digits.length !== 10) return '사업자등록번호는 10자리 숫자여야 합니다.';
    return null;
  }
  return 'identifierType은 phone 또는 biz 여야 합니다.';
}

// POST /receipts/cash — 현금영수증 발행 요청
router.post('/cash', async (req, res) => {
  try {
    const userId = req.user!.id;
    const rideId = req.body?.rideId != null ? String(req.body.rideId).trim() : '';
    const identifierRaw = String(req.body?.identifier ?? '');
    const identifierType = String(req.body?.identifierType ?? '').toLowerCase();
    const amount = Number(req.body?.amount);

    if (identifierType !== 'phone' && identifierType !== 'biz') {
      res.status(400).json({ success: false, error: 'identifierType은 phone 또는 biz 입니다.' });
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      res.status(400).json({ success: false, error: 'amount는 1 이상의 정수여야 합니다.' });
      return;
    }

    const identifier = onlyDigits(identifierRaw);
    const idErr = validateIdentifier(identifierType, identifier);
    if (idErr) {
      res.status(400).json({ success: false, error: idErr });
      return;
    }

    if (rideId) {
      const ride = await prisma.ride.findFirst({
        where: { id: rideId, userId },
        select: { id: true },
      });
      if (!ride) {
        res.status(400).json({ success: false, error: '해당 운행을 찾을 수 없거나 권한이 없습니다.' });
        return;
      }
    }

    // PG 결제 내역에서 receiptUrl(현금영수증 다운로드 URL)을 재사용
    // (rideId가 있을 때만 조회, 없으면 null)
    let downloadUrl: string | null = null;
    if (rideId) {
      const payment = await prisma.payment.findFirst({
        where: { rideId, userId },
        select: { receiptUrl: true },
      });
      downloadUrl = payment?.receiptUrl ?? null;
    }

    // 외부 PG 연동 전까지 DB 저장 + 즉시 issued
    const row = await prisma.cashReceipt.create({
      data: {
        userId,
        rideId: rideId || null,
        identifier,
        identifierType,
        amount,
        status: 'issued',
        issuedAt: new Date(),
        downloadUrl,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: row.id,
        status: row.status,
        issuedAt: row.issuedAt.toISOString(),
        downloadUrl: row.downloadUrl ?? undefined,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /receipts/cash — 발행 내역
router.get('/cash', async (req, res) => {
  try {
    const userId = req.user!.id;
    const items = await prisma.cashReceipt.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });

    res.json({
      success: true,
      data: {
        items: items.map((r) => ({
          id: r.id,
          status: r.status,
          issuedAt: r.issuedAt.toISOString(),
          downloadUrl: r.downloadUrl ?? undefined,
          amount: r.amount,
          identifier: maskIdentifier(r.identifier),
        })),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
