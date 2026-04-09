import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

const MIN_WITHDRAW = 20000;
const WITHDRAW_UNIT = 10000;
const MIN_BALANCE_FOR_WITHDRAW = 0; // 전액 출금 가능
const WITHDRAW_FEE = 500; // 고정 수수료

// POST /withdrawals
router.post('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { amount, bankCode, accountNumber, accountHolder } = req.body;

    if (!amount || !bankCode || !accountNumber || !accountHolder) {
      res.status(400).json({
        success: false,
        error: 'amount, bankCode, accountNumber, accountHolder 필수',
      });
      return;
    }

    const amt = Number(amount);
    if (amt < MIN_WITHDRAW || amt % WITHDRAW_UNIT !== 0) {
      res.status(400).json({
        success: false,
        error: `${MIN_WITHDRAW}원 이상, ${WITHDRAW_UNIT}원 단위로 신청`,
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const withdrawable = Math.max(0, (user?.mileageBalance ?? 0) - MIN_BALANCE_FOR_WITHDRAW);
    if (amt > withdrawable) {
      res.status(400).json({
        success: false,
        error: `출금 가능 금액: ${withdrawable}원`,
      });
      return;
    }

    const fee = WITHDRAW_FEE;
    const netAmount = Math.max(0, amt - fee);

    const withdrawal = await prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.create({
        data: {
          userId,
          amount: amt,
          bankCode: String(bankCode).trim(),
          accountNumber: String(accountNumber).trim(),
          accountHolder: String(accountHolder).trim(),
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { mileageBalance: { decrement: amt } },
        select: { mileageBalance: true },
      });

      await tx.mileageHistory.create({
        data: {
          userId,
          type: 'withdraw',
          amount: -amt,
          balance: updatedUser.mileageBalance,
          description: '마일리지 출금 신청',
        },
      });

      return w;
    });

    res.status(201).json({
      success: true,
      data: {
        id: withdrawal.id,
        status: withdrawal.status,
        requestedAt: withdrawal.requestedAt,
        fee,
        netAmount,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
