import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { refundAuthPayment, isPortOneConfigured } from '../../lib/portone';

const router = Router();

// POST /cards
router.post('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { cardToken, cardName, expiryDate, option } = req.body;

    if (!cardName) {
      res.status(400).json({ success: false, error: 'cardName 필수' });
      return;
    }

    const last4 = cardName.match(/\d{4}/g)?.pop() ?? '';

    const card = await prisma.userCard.create({
      data: {
        userId,
        cardToken: cardToken || null,
        cardName: String(cardName),
        last4Digits: last4 || null,
        expiryDate: expiryDate || null,
        option: option || null,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: card.id,
        cardName: card.cardName,
        last4Digits: card.last4Digits,
        expiryDate: card.expiryDate,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /cards
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const cards = await prisma.userCard.findMany({
      where: { userId },
      select: { id: true, cardName: true, last4Digits: true, expiryDate: true },
    });
    res.json({
      success: true,
      data: cards.map((c) => ({
        id: c.id,
        cardName: c.cardName,
        last4Digits: c.last4Digits,
        expiryDate: c.expiryDate,
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /cards/:id
// 카드 삭제 시 100원 인증 결제(transactionId) 환불 시도 → DB 삭제
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user!.id;
    const card = await prisma.userCard.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!card) {
      return res.status(404).json({ success: false, error: '카드를 찾을 수 없습니다.' });
    }

    // cardToken(transactionId)이 있으면 100원 환불 시도
    if (card.cardToken && isPortOneConfigured()) {
      const result = await refundAuthPayment(card.cardToken);
      if (!result.success) {
        // 환불 실패 시에도 카드는 삭제 (이미 환불됐거나 유효기간 만료 등)
        console.warn(`[PortOne] Card delete refund failed: ${result.error}`);
      }
    }

    await prisma.userCard.deleteMany({
      where: { id: req.params.id, userId },
    });
    res.json({ success: true, data: null });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
