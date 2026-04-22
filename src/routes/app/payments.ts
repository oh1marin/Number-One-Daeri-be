import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { payWithBillingKey, isBillingKeyPayConfigured } from '../../lib/portone';
import { randomUUID } from 'crypto';
import { readIdempotencyKey, portoneBillingPaymentId } from '../../lib/idempotency';

const router = Router();

const paymentChargeInclude = {
  ride: { select: { id: true, date: true, time: true, pickup: true, dropoff: true } },
  card: { select: { id: true, cardName: true, last4Digits: true } },
} as const;

const paymentPostInclude = paymentChargeInclude;

type PaymentChargePayload = Prisma.PaymentGetPayload<{ include: typeof paymentChargeInclude }>;

function jsonChargeWithCard(
  payment: PaymentChargePayload,
  opts?: { idempotentReplay?: boolean; message?: string }
) {
  return {
    success: true as const,
    data: {
      id: payment.id,
      rideId: payment.rideId,
      ride: payment.ride,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      pgTid: payment.pgTid,
      card: payment.card,
      createdAt: payment.createdAt,
      ...(opts?.message ? { message: opts.message } : {}),
      ...(opts?.idempotentReplay ? { idempotentReplay: true as const } : {}),
    },
  };
}

type PaymentPostPayload = Prisma.PaymentGetPayload<{ include: typeof paymentPostInclude }>;

function jsonPostPaymentRecord(
  payment: PaymentPostPayload,
  opts: { idempotentReplay?: boolean; cardSaved?: boolean }
) {
  return {
    success: true as const,
    data: {
      id: payment.id,
      rideId: payment.rideId,
      ride: payment.ride,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      pgTid: payment.pgTid,
      card: payment.card,
      receiptUrl: payment.receiptUrl,
      createdAt: payment.createdAt,
      ...(opts.cardSaved != null ? { cardSaved: opts.cardSaved } : {}),
      ...(opts.idempotentReplay ? { idempotentReplay: true as const } : {}),
    },
  };
}

/**
 * POST /payments/charge-with-card
 * 등록 카드로 결제 (빌링키 결제) — 서버에서 PortOne API로 청구
 * Body: { rideId, amount, cardId, idempotencyKey? } · 헤더 Idempotency-Key 동일
 */
router.post('/charge-with-card', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { rideId, amount, cardId, idempotencyKey: bodyIdem } = req.body;

    const idemResult = readIdempotencyKey(req, bodyIdem);
    if (!idemResult.ok) {
      return res.status(400).json({ success: false, error: idemResult.error });
    }
    const idemKey = idemResult.key;

    if (!isBillingKeyPayConfigured()) {
      return res.status(503).json({
        success: false,
        error: '등록 카드 결제가 설정되지 않았습니다. (PORTONE_CHANNEL_KEY)',
      });
    }

    const amountNum = Number(amount);
    if (!Number.isInteger(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, error: 'amount는 1 이상 정수여야 합니다.' });
    }
    if (!rideId || !cardId) {
      return res.status(400).json({ success: false, error: 'rideId, cardId 필수' });
    }

    if (idemKey) {
      const existing = await prisma.payment.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: idemKey } },
        include: paymentChargeInclude,
      });
      if (existing) {
        return res
          .status(200)
          .json(
            jsonChargeWithCard(existing, {
              idempotentReplay: true,
              message: '이미 처리된 결제입니다.',
            })
          );
      }
    }

    const ride = await prisma.ride.findFirst({
      where: { id: rideId, userId },
      include: { user: { select: { name: true } } },
    });
    if (!ride) {
      return res.status(404).json({ success: false, error: '해당 콜을 찾을 수 없습니다.' });
    }

    const card = await prisma.userCard.findFirst({
      where: { id: cardId, userId },
    });
    if (!card) {
      return res.status(400).json({ success: false, error: '등록된 카드가 아닙니다.' });
    }
    if (!card.cardToken) {
      return res.status(400).json({
        success: false,
        error: '카드 인증 정보가 없습니다. 카드를 다시 등록해 주세요.',
      });
    }

    const paymentId = idemKey
      ? portoneBillingPaymentId(userId, idemKey)
      : `charge_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const orderName = `대리운전 이용료 (${ride.pickup ?? ''} → ${ride.dropoff ?? ''})`.slice(0, 100);

    const result = await payWithBillingKey(paymentId, card.cardToken, amountNum, orderName);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error ?? '결제에 실패했습니다.',
      });
    }

    try {
      const payment = await prisma.payment.create({
        data: {
          userId,
          rideId,
          amount: amountNum,
          method: 'card',
          status: 'completed',
          pgProvider: 'portone',
          pgTid: result.pgTxId ?? paymentId,
          cardId: card.id,
          ...(idemKey ? { idempotencyKey: idemKey } : {}),
        },
        include: paymentChargeInclude,
      });

      return res.status(201).json(jsonChargeWithCard(payment, { message: '결제가 완료되었습니다.' }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && idemKey) {
        const existing = await prisma.payment.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: idemKey } },
          include: paymentChargeInclude,
        });
        if (existing) {
          return res
            .status(200)
            .json(
              jsonChargeWithCard(existing, {
                idempotentReplay: true,
                message: '이미 처리된 결제입니다.',
              })
            );
        }
      }
      throw e;
    }
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

/**
 * POST /payments
 * Flutter 앱에서 카드/카카오페이 결제 완료 후 호출 → 백엔드에 결제 내역 저장
 * Body: { rideId?, amount, cardId?, billingKey?, cardName?, pgTid?, pgProvider?, receiptUrl?, rawResponse?, idempotencyKey? }
 * 멱등: 헤더 Idempotency-Key 또는 body.idempotencyKey, 또는 동일 userId+pgTid 재전송 시 기존 행 반환(200)
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      rideId,
      amount,
      cardId,
      billingKey,
      cardName,
      pgTid,
      pgProvider,
      receiptUrl,
      rawResponse,
      idempotencyKey: bodyIdem,
    } = req.body;

    const idemResult = readIdempotencyKey(req, bodyIdem);
    if (!idemResult.ok) {
      res.status(400).json({ success: false, error: idemResult.error });
      return;
    }
    const idemKey = idemResult.key;

    const amountNum = Number(amount);
    if (!Number.isInteger(amountNum) || amountNum < 0) {
      res.status(400).json({ success: false, error: 'amount는 0 이상 정수여야 합니다.' });
      return;
    }

    if (rideId) {
      const ride = await prisma.ride.findFirst({
        where: { id: rideId, userId },
      });
      if (!ride) {
        res.status(404).json({ success: false, error: '해당 콜을 찾을 수 없습니다.' });
        return;
      }
    }

    if (idemKey) {
      const existing = await prisma.payment.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: idemKey } },
        include: paymentPostInclude,
      });
      if (existing) {
        res.status(200).json(
          jsonPostPaymentRecord(existing, {
            idempotentReplay: true,
            cardSaved: false,
          })
        );
        return;
      }
    }

    const pgTidNorm = pgTid != null && String(pgTid).trim() !== '' ? String(pgTid).trim() : null;
    if (pgTidNorm) {
      const existingPg = await prisma.payment.findFirst({
        where: { userId, pgTid: pgTidNorm },
        include: paymentPostInclude,
      });
      if (existingPg) {
        res.status(200).json(
          jsonPostPaymentRecord(existingPg, {
            idempotentReplay: true,
            cardSaved: false,
          })
        );
        return;
      }
    }

    let finalCardId: string | null = cardId || null;

    if (cardId) {
      const card = await prisma.userCard.findFirst({
        where: { id: cardId, userId },
      });
      if (!card) {
        res.status(400).json({ success: false, error: '등록된 카드가 아닙니다.' });
        return;
      }
    } else if (pgProvider === 'portone' && billingKey && cardName) {
      const existing = await prisma.userCard.findFirst({
        where: { userId, cardToken: billingKey },
      });
      if (existing) {
        finalCardId = existing.id;
      } else {
        const last4 = String(cardName).match(/\d{4}/g)?.pop() ?? null;
        const newCard = await prisma.userCard.create({
          data: {
            userId,
            cardToken: billingKey,
            cardName: String(cardName),
            last4Digits: last4,
          },
        });
        finalCardId = newCard.id;
      }
    }

    const method =
      pgProvider === 'kakaopay' ? 'kakaopay'
      : pgProvider === 'tosspay' ? 'tosspay'
      : 'card';

    const cardSavedFlag = !!finalCardId && !cardId && !!billingKey;

    try {
      const payment = await prisma.payment.create({
        data: {
          userId,
          rideId: rideId || null,
          amount: amountNum,
          method,
          status: 'completed',
          pgProvider: pgProvider ?? null,
          pgTid: pgTidNorm,
          cardId: finalCardId,
          receiptUrl: receiptUrl ?? null,
          rawResponse: rawResponse ?? undefined,
          ...(idemKey ? { idempotencyKey: idemKey } : {}),
        },
        include: paymentPostInclude,
      });

      res.status(201).json(jsonPostPaymentRecord(payment, { cardSaved: cardSavedFlag }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        if (idemKey) {
          const ex = await prisma.payment.findUnique({
            where: { userId_idempotencyKey: { userId, idempotencyKey: idemKey } },
            include: paymentPostInclude,
          });
          if (ex) {
            res.status(200).json(jsonPostPaymentRecord(ex, { idempotentReplay: true, cardSaved: false }));
            return;
          }
        }
        if (pgTidNorm) {
          const ex = await prisma.payment.findFirst({
            where: { userId, pgTid: pgTidNorm },
            include: paymentPostInclude,
          });
          if (ex) {
            res.status(200).json(jsonPostPaymentRecord(ex, { idempotentReplay: true, cardSaved: false }));
            return;
          }
        }
      }
      throw e;
    }
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

/**
 * GET /payments
 * 내 결제 내역 목록 (최신순)
 * Query: page, limit
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          ride: { select: { id: true, date: true, time: true, pickup: true, dropoff: true } },
          card: { select: { id: true, cardName: true, last4Digits: true } },
        },
      }),
      prisma.payment.count({ where: { userId } }),
    ]);

    res.json({
      success: true,
      data: {
        items: items.map((p) => ({
          id: p.id,
          rideId: p.rideId,
          ride: p.ride,
          amount: p.amount,
          method: p.method,
          status: p.status,
          pgTid: p.pgTid,
          card: p.card,
          receiptUrl: p.receiptUrl,
          createdAt: p.createdAt,
        })),
        total,
        page,
        limit,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

/**
 * GET /payments/:id
 * 결제 단건 조회 (본인 것만)
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user!.id;
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, userId },
      include: {
        ride: { select: { id: true, date: true, time: true, pickup: true, dropoff: true, total: true } },
        card: { select: { id: true, cardName: true, last4Digits: true, expiryDate: true } },
      },
    });

    if (!payment) {
      res.status(404).json({ success: false, error: '결제 내역을 찾을 수 없습니다.' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: payment.id,
        rideId: payment.rideId,
        ride: payment.ride,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        pgProvider: payment.pgProvider,
        pgTid: payment.pgTid,
        card: payment.card,
        receiptUrl: payment.receiptUrl,
        createdAt: payment.createdAt,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
