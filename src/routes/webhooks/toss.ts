import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  mapTossMethodToAppMethod,
  tossReceiptUrl,
  tossWebhookSecretFromRaw,
  type TossPayment,
} from '../../lib/tosspayments';

const router = Router();

type TossWebhookBody = {
  eventType?: string;
  createdAt?: string;
  data?: TossPayment & { secret?: string };
};

/**
 * POST /webhooks/toss
 * 토스페이먼츠 웹훅 — PAYMENT_STATUS_CHANGED 등
 * @see https://docs.tosspayments.com/reference/using-api/webhook-events
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body as TossWebhookBody;
    const eventType = body.eventType;
    const data = body.data;

    if (!data?.orderId) {
      res.status(200).json({ received: true });
      return;
    }

    const paymentId = data.orderId.startsWith('RIDE_') ? data.orderId.slice(5) : null;
    if (!paymentId) {
      res.status(200).json({ received: true });
      return;
    }

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, pgProvider: 'tosspayments' },
    });
    if (!payment) {
      res.status(200).json({ received: true });
      return;
    }

    const storedSecret = tossWebhookSecretFromRaw(payment.rawResponse);
    const webhookSecret = data.secret?.trim();
    if (storedSecret && webhookSecret && storedSecret !== webhookSecret) {
      console.warn('[toss-webhook] secret mismatch', { paymentId, eventType });
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const status = data.status;
    let nextStatus = payment.status;
    if (status === 'DONE') nextStatus = 'completed';
    else if (status === 'CANCELED' || status === 'EXPIRED' || status === 'ABORTED') {
      nextStatus = 'failed';
    } else if (status === 'PARTIAL_CANCELED') nextStatus = 'completed';

    const method = mapTossMethodToAppMethod(data);
    const receiptUrl = tossReceiptUrl(data);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: nextStatus,
        method,
        pgTid: data.paymentKey ?? payment.pgTid,
        amount: data.totalAmount ?? payment.amount,
        receiptUrl: receiptUrl ?? payment.receiptUrl,
        rawResponse: {
          tossSecret: webhookSecret ?? storedSecret,
          toss: data,
          lastWebhook: { eventType, createdAt: body.createdAt },
        } as Prisma.InputJsonValue,
      },
    });

    res.status(200).json({ received: true });
  } catch (e) {
    console.error('[toss-webhook]', e);
    res.status(500).json({ received: false });
  }
});

export default router;
