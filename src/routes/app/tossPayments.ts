import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { readIdempotencyKey } from '../../lib/idempotency';
import {
  cancelTossPayment,
  confirmTossPayment,
  getTossApiClientKey,
  getTossWidgetClientKey,
  getTossPaymentByKey,
  isTossBillingConfigured,
  isTossConfigured,
  issueTossBillingKey,
  mapTossMethodToAppMethod,
  parsePaymentIdFromTossOrderId,
  tossBillingKeySetupHint,
  tossCustomerKeyForUser,
  tossOrderIdFromPaymentId,
  tossReceiptUrl,
  tossWidgetKeySetupHint,
  type TossBilling,
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
  const hint = tossWidgetKeySetupHint();
  return res.status(503).json({
    success: false,
    error: hint || '토스페이먼츠가 설정되지 않았습니다. (TOSS_WIDGET_CLIENT_KEY, TOSS_WIDGET_SECRET_KEY)',
    message: hint || '토스페이먼츠가 설정되지 않았습니다. (TOSS_WIDGET_CLIENT_KEY, TOSS_WIDGET_SECRET_KEY)',
  });
}

function tossBillingNotConfigured(res: import('express').Response) {
  const hint = tossBillingKeySetupHint();
  const msg =
    hint ||
    '카드 자동결제(빌링)는 아직 계약되지 않았거나 설정되지 않았습니다. 토스페이먼츠 자동결제 계약 후 TOSS_API_CLIENT_KEY/SECRET_KEY를 설정해 주세요.';
  return res.status(503).json({
    success: false,
    error: msg,
    message: msg,
    code: 'BILLING_NOT_CONFIGURED',
  });
}

function billingCardLabel(billing: TossBilling): string {
  const num = billing.card?.number ?? billing.cardNumber ?? '';
  const digits = num.replace(/\D/g, '');
  const last4 = digits.length >= 4 ? digits.slice(-4) : '';
  const company = billing.cardCompany?.trim();
  if (company && last4) return `${company} *${last4}`;
  if (last4) return `카드 *${last4}`;
  return '등록카드';
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
  if (!isTossConfigured()) {
    const clientKey = getTossWidgetClientKey();
    if (!clientKey) {
      return res.status(503).json({
        success: false,
        error: tossWidgetKeySetupHint(),
        message: tossWidgetKeySetupHint(),
      });
    }
    return tossNotConfigured(res);
  }
  const clientKey = getTossWidgetClientKey();
  if (!clientKey) {
    return res.status(503).json({
      success: false,
      error: tossWidgetKeySetupHint(),
      message: tossWidgetKeySetupHint(),
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
        if (existing.status === 'completed') {
          const orderId = tossOrderIdFromPaymentId(existing.id);
          return res.status(200).json({
            success: true,
            data: {
              paymentId: existing.id,
              orderId,
              amount: existing.amount,
              orderName: buildOrderName(existing.ride?.pickup, existing.ride?.dropoff),
              clientKey: getTossWidgetClientKey(),
              status: existing.status,
              idempotentReplay: true as const,
            },
          });
        }
        if (existing.status === 'pending' && existing.amount === amountNum) {
          const orderId = tossOrderIdFromPaymentId(existing.id);
          return res.status(200).json({
            success: true,
            data: {
              paymentId: existing.id,
              orderId,
              amount: existing.amount,
              orderName: buildOrderName(existing.ride?.pickup, existing.ride?.dropoff),
              clientKey: getTossWidgetClientKey(),
              status: existing.status,
              idempotentReplay: true as const,
            },
          });
        }
        if (existing.status === 'failed') {
          await prisma.payment.update({
            where: { id: existing.id },
            data: { idempotencyKey: null },
          });
        }
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
      const clientKey = getTossWidgetClientKey();

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
              clientKey: getTossWidgetClientKey(),
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

/**
 * GET /payments/toss/billing/config
 * 카드 등록(빌링 인증)용 API 클라이언트 키 + customerKey
 */
router.get('/billing/config', (req, res) => {
  if (!isTossBillingConfigured()) return tossBillingNotConfigured(res);

  const clientKey = getTossApiClientKey();
  if (!clientKey) {
    const hint = tossBillingKeySetupHint();
    return res.status(503).json({
      success: false,
      error: hint,
      message: hint,
    });
  }

  const userId = req.user!.id;
  res.json({
    success: true,
    data: {
      clientKey,
      customerKey: tossCustomerKeyForUser(userId),
      provider: 'tosspayments',
    },
  });
});

/**
 * POST /payments/toss/billing/issue
 * 빌링 인증 후 authKey로 빌링키 발급
 * Body: { authKey, idempotencyKey? }
 */
router.post('/billing/issue', async (req, res) => {
  try {
    if (!isTossBillingConfigured()) return tossBillingNotConfigured(res);

    const userId = req.user!.id;
    const { authKey, idempotencyKey: bodyIdem } = req.body;

    const idemResult = readIdempotencyKey(req, bodyIdem);
    if (!idemResult.ok) {
      return res.status(400).json({ success: false, error: idemResult.error, message: idemResult.error });
    }

    const authKeyStr = authKey != null ? String(authKey).trim() : '';
    if (!authKeyStr) {
      const msg = 'authKey 필수';
      return res.status(400).json({ success: false, error: msg, message: msg });
    }

    const customerKey = tossCustomerKeyForUser(userId);
    const result = await issueTossBillingKey(
      authKeyStr,
      customerKey,
      idemResult.key ?? undefined
    );

    if (!result.ok) {
      const httpStatus = result.status >= 400 && result.status < 600 ? result.status : 400;
      return res.status(httpStatus).json({
        success: false,
        error: result.message,
        message: result.message,
        code: result.code,
      });
    }

    const billing = result.billing;
    res.status(200).json({
      success: true,
      data: {
        billingKey: billing.billingKey,
        customerKey: billing.customerKey,
        cardName: billingCardLabel(billing),
        cardNumber: billing.card?.number ?? billing.cardNumber ?? null,
        provider: 'tosspayments',
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e), message: String(e) });
  }
});

export default router;
