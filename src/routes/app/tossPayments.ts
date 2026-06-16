import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { readIdempotencyKey } from '../../lib/idempotency';
import {
  cancelTossPayment,
  confirmTossPayment,
  getTossClientKey,
  getTossPaymentByKey,
  isTossConfigured,
  mapTossMethodToAppMethod,
  parsePaymentIdFromTossOrderId,
  tossOrderIdFromPaymentId,
  tossReceiptUrl,
  type TossPayment,
} from '../../lib/tosspayments';

const router = Router();

const paymentInclude = {
  ride: { select: { id: true, date: true, time: true, pickup: true, dropoff: true } },
  card: { select: { id: true, cardName: true, last4Digits: true } },
} as const;

type PaymentPayload = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

function jsonPayment(
  payment: PaymentPayload,
  opts?: { idempotentReplay?: boolean; message?: string; clientKey?: string | null }
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
      pgProvider: payment.pgProvider,
      pgTid: payment.pgTid,
      card: payment.card,
      receiptUrl: payment.receiptUrl,
      createdAt: payment.createdAt,
      ...(opts?.clientKey != null ? { clientKey: opts.clientKey } : {}),
      ...(opts?.message ? { message: opts.message } : {}),
      ...(opts?.idempotentReplay ? { idempotentReplay: true as const } : {}),
    },
  };
}

function tossNotConfigured(res: import('express').Response) {
  return res.status(503).json({
    success: false,
    error: '토스페이먼츠가 설정되지 않았습니다. (TOSS_SECRET_KEY)',
    message: '토스페이먼츠가 설정되지 않았습니다. (TOSS_SECRET_KEY)',
  });
}

function buildOrderName(pickup?: string | null, dropoff?: string | null): string {
  return `대리운전 이용료 (${pickup ?? ''} → ${dropoff ?? ''})`.slice(0, 100);
}

async function applyTossPaymentDone(
  pending: PaymentPayload,
  toss: TossPayment,
  idemKey: string | null
): Promise<PaymentPayload> {
  const method = mapTossMethodToAppMethod(toss);
  const receiptUrl = tossReceiptUrl(toss);
  const rawResponse = {
    tossSecret: toss.secret ?? null,
    toss,
  } as Prisma.InputJsonValue;

  return prisma.payment.update({
    where: { id: pending.id },
    data: {
      amount: toss.totalAmount,
      method,
      status: toss.status === 'DONE' ? 'completed' : pending.status,
      pgProvider: 'tosspayments',
      pgTid: toss.paymentKey,
      receiptUrl,
      rawResponse,
      ...(idemKey ? { idempotencyKey: idemKey } : {}),
    },
    include: paymentInclude,
  });
}

/**
 * GET /payments/toss/config
 * 앱 결제위젯용 클라이언트 키 (시크릿 키는 절대 노출하지 않음)
 */
router.get('/config', (_req, res) => {
  if (!isTossConfigured()) return tossNotConfigured(res);
  const clientKey = getTossClientKey();
  if (!clientKey) {
    return res.status(503).json({
      success: false,
      error: 'TOSS_CLIENT_KEY가 설정되지 않았습니다.',
      message: 'TOSS_CLIENT_KEY가 설정되지 않았습니다.',
    });
  }
  res.json({
    success: true,
    data: {
      clientKey,
      provider: 'tosspayments',
    },
  });
});

/**
 * POST /payments/toss/prepare
 * 결제위젯 호출 전 주문 생성 — orderId·금액을 서버에서 고정
 * Body: { rideId, amount, idempotencyKey? }
 */
router.post('/prepare', async (req, res) => {
  try {
    if (!isTossConfigured()) return tossNotConfigured(res);

    const userId = req.user!.id;
    const { rideId, amount, idempotencyKey: bodyIdem } = req.body;

    const idemResult = readIdempotencyKey(req, bodyIdem);
    if (!idemResult.ok) {
      return res.status(400).json({ success: false, error: idemResult.error, message: idemResult.error });
    }
    const idemKey = idemResult.key;

    const amountNum = Number(amount);
    if (!Number.isInteger(amountNum) || amountNum <= 0) {
      const msg = 'amount는 1 이상 정수여야 합니다.';
      return res.status(400).json({ success: false, error: msg, message: msg });
    }
    if (!rideId) {
      const msg = 'rideId 필수';
      return res.status(400).json({ success: false, error: msg, message: msg });
    }

    if (idemKey) {
      const existing = await prisma.payment.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: idemKey } },
        include: paymentInclude,
      });
      if (existing && existing.pgProvider === 'tosspayments') {
        const orderId = tossOrderIdFromPaymentId(existing.id);
        return res.status(200).json({
          success: true,
          data: {
            paymentId: existing.id,
            orderId,
            amount: existing.amount,
            orderName: buildOrderName(existing.ride?.pickup, existing.ride?.dropoff),
            clientKey: getTossClientKey(),
            status: existing.status,
            idempotentReplay: true as const,
          },
        });
      }
    }

    const ride = await prisma.ride.findFirst({
      where: { id: rideId, userId },
    });
    if (!ride) {
      const msg = '해당 콜을 찾을 수 없습니다.';
      return res.status(404).json({ success: false, error: msg, message: msg });
    }

    await prisma.payment.updateMany({
      where: {
        userId,
        rideId,
        status: 'pending',
        pgProvider: 'tosspayments',
      },
      data: { status: 'failed' },
    });

    const orderName = buildOrderName(ride.pickup, ride.dropoff);

    try {
      const payment = await prisma.payment.create({
        data: {
          userId,
          rideId,
          amount: amountNum,
          method: 'card',
          status: 'pending',
          pgProvider: 'tosspayments',
          ...(idemKey ? { idempotencyKey: idemKey } : {}),
        },
        include: paymentInclude,
      });

      const orderId = tossOrderIdFromPaymentId(payment.id);
      const clientKey = getTossClientKey();

      return res.status(201).json({
        success: true,
        data: {
          paymentId: payment.id,
          orderId,
          amount: amountNum,
          orderName,
          clientKey,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && idemKey) {
        const existing = await prisma.payment.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: idemKey } },
          include: paymentInclude,
        });
        if (existing) {
          return res.status(200).json({
            success: true,
            data: {
              paymentId: existing.id,
              orderId: tossOrderIdFromPaymentId(existing.id),
              amount: existing.amount,
              orderName: buildOrderName(existing.ride?.pickup, existing.ride?.dropoff),
              clientKey: getTossClientKey(),
              idempotentReplay: true as const,
            },
          });
        }
      }
      throw e;
    }
  } catch (e) {
    res.status(500).json({ success: false, error: String(e), message: String(e) });
  }
});

/**
 * POST /payments/toss/confirm
 * 결제위젯 인증 후 서버 승인 — POST /v1/payments/confirm
 * Body: { paymentKey, orderId, amount, idempotencyKey? }
 */
router.post('/confirm', async (req, res) => {
  try {
    if (!isTossConfigured()) return tossNotConfigured(res);

    const userId = req.user!.id;
    const { paymentKey, orderId, amount, idempotencyKey: bodyIdem } = req.body;

    const idemResult = readIdempotencyKey(req, bodyIdem);
    if (!idemResult.ok) {
      return res.status(400).json({ success: false, error: idemResult.error, message: idemResult.error });
    }
    const idemKey = idemResult.key;

    const paymentKeyStr = paymentKey != null ? String(paymentKey).trim() : '';
    const orderIdStr = orderId != null ? String(orderId).trim() : '';
    const amountNum = Number(amount);

    if (!paymentKeyStr) {
      const msg = 'paymentKey 필수';
      return res.status(400).json({ success: false, error: msg, message: msg });
    }
    if (!orderIdStr) {
      const msg = 'orderId 필수';
      return res.status(400).json({ success: false, error: msg, message: msg });
    }
    if (!Number.isInteger(amountNum) || amountNum <= 0) {
      const msg = 'amount는 1 이상 정수여야 합니다.';
      return res.status(400).json({ success: false, error: msg, message: msg });
    }

    if (idemKey) {
      const existing = await prisma.payment.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: idemKey } },
        include: paymentInclude,
      });
      if (existing?.status === 'completed' && existing.pgProvider === 'tosspayments') {
        return res
          .status(200)
          .json(jsonPayment(existing, { idempotentReplay: true, message: '이미 처리된 결제입니다.' }));
      }
    }

    const existingPg = await prisma.payment.findFirst({
      where: { userId, pgTid: paymentKeyStr, pgProvider: 'tosspayments' },
      include: paymentInclude,
    });
    if (existingPg?.status === 'completed') {
      return res
        .status(200)
        .json(jsonPayment(existingPg, { idempotentReplay: true, message: '이미 처리된 결제입니다.' }));
    }

    const paymentId = parsePaymentIdFromTossOrderId(orderIdStr);
    if (!paymentId) {
      const msg = '유효하지 않은 orderId입니다.';
      return res.status(400).json({ success: false, error: msg, message: msg });
    }

    const pending = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        userId,
        pgProvider: 'tosspayments',
        status: 'pending',
      },
      include: paymentInclude,
    });
    if (!pending) {
      const msg = '결제 준비 내역을 찾을 수 없습니다. prepare를 먼저 호출해 주세요.';
      return res.status(404).json({ success: false, error: msg, message: msg });
    }
    if (pending.amount !== amountNum) {
      const msg = '결제 금액이 일치하지 않습니다.';
      return res.status(400).json({ success: false, error: msg, message: msg });
    }

    let tossPayment: TossPayment | null = null;

    const confirmResult = await confirmTossPayment(
      paymentKeyStr,
      orderIdStr,
      amountNum,
      idemKey ?? undefined
    );

    if (confirmResult.ok) {
      tossPayment = confirmResult.payment;
    } else if (confirmResult.code === 'ALREADY_PROCESSED_PAYMENT') {
      const fetched = await getTossPaymentByKey(paymentKeyStr);
      if (!fetched.ok) {
        return res.status(confirmResult.status).json({
          success: false,
          error: confirmResult.message,
          message: confirmResult.message,
          code: confirmResult.code,
        });
      }
      tossPayment = fetched.payment;
      if (tossPayment.orderId !== orderIdStr || tossPayment.totalAmount !== amountNum) {
        const msg = '이미 승인된 결제 정보가 요청과 일치하지 않습니다.';
        return res.status(400).json({ success: false, error: msg, message: msg });
      }
    } else {
      await prisma.payment.update({
        where: { id: pending.id },
        data: { status: 'failed' },
      });
      const httpStatus = confirmResult.status >= 400 && confirmResult.status < 600 ? confirmResult.status : 400;
      return res.status(httpStatus).json({
        success: false,
        error: confirmResult.message,
        message: confirmResult.message,
        code: confirmResult.code,
      });
    }

    if (!tossPayment || tossPayment.status !== 'DONE') {
      const msg = tossPayment?.failure?.message ?? '결제 승인에 실패했습니다.';
      await prisma.payment.update({
        where: { id: pending.id },
        data: { status: 'failed', rawResponse: tossPayment as unknown as Prisma.InputJsonValue },
      });
      return res.status(400).json({ success: false, error: msg, message: msg });
    }

    try {
      const completed = await applyTossPaymentDone(pending, tossPayment, idemKey);
      return res.status(200).json(jsonPayment(completed, { message: '결제가 완료되었습니다.' }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const dup =
          (idemKey
            ? await prisma.payment.findUnique({
                where: { userId_idempotencyKey: { userId, idempotencyKey: idemKey } },
                include: paymentInclude,
              })
            : null) ??
          (await prisma.payment.findFirst({
            where: { userId, pgTid: paymentKeyStr },
            include: paymentInclude,
          }));
        if (dup) {
          return res
            .status(200)
            .json(jsonPayment(dup, { idempotentReplay: true, message: '이미 처리된 결제입니다.' }));
        }
      }
      throw e;
    }
  } catch (e) {
    res.status(500).json({ success: false, error: String(e), message: String(e) });
  }
});

/**
 * POST /payments/toss/cancel
 * 본인 결제 취소(환불) — 관리자는 /admin/card-payments/cancel 사용
 * Body: { paymentId, cancelReason?, cancelAmount? }
 */
router.post('/cancel', async (req, res) => {
  try {
    if (!isTossConfigured()) return tossNotConfigured(res);

    const userId = req.user!.id;
    const { paymentId, cancelReason, cancelAmount } = req.body;

    if (!paymentId) {
      const msg = 'paymentId 필수';
      return res.status(400).json({ success: false, error: msg, message: msg });
    }

    const payment = await prisma.payment.findFirst({
      where: { id: String(paymentId), userId, pgProvider: 'tosspayments' },
    });
    if (!payment) {
      const msg = '결제 내역을 찾을 수 없습니다.';
      return res.status(404).json({ success: false, error: msg, message: msg });
    }
    if (!payment.pgTid) {
      const msg = '취소할 결제 키(paymentKey)가 없습니다.';
      return res.status(400).json({ success: false, error: msg, message: msg });
    }
    if (payment.status !== 'completed') {
      const msg = '완료된 결제만 취소할 수 있습니다.';
      return res.status(400).json({ success: false, error: msg, message: msg });
    }

    const reason = cancelReason != null && String(cancelReason).trim()
      ? String(cancelReason).trim()
      : '구매자 요청 취소';

    const amountNum =
      cancelAmount != null && Number(cancelAmount) > 0 ? Number(cancelAmount) : undefined;

    const result = await cancelTossPayment(payment.pgTid, reason, amountNum);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error ?? '결제 취소에 실패했습니다.',
        message: result.error ?? '결제 취소에 실패했습니다.',
      });
    }

    const toss = result.payment;
    const fullyCanceled =
      toss?.status === 'CANCELED' ||
      (toss?.balanceAmount != null && toss.balanceAmount === 0);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: fullyCanceled ? 'failed' : payment.status,
        rawResponse: toss
          ? ({ tossSecret: toss.secret ?? null, toss } as Prisma.InputJsonValue)
          : payment.rawResponse ?? undefined,
      },
    });

    res.json({
      success: true,
      data: { message: '결제가 취소되었습니다.', status: toss?.status },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e), message: String(e) });
  }
});

export default router;
