import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { normalizeCouponType } from '../../lib/couponDisplay';

const router = Router();

async function getOrCreateCouponBudget() {
  const existing = await prisma.couponBudget.findFirst();
  if (existing) return existing;
  return prisma.couponBudget.create({ data: { balance: 0 } });
}

// GET /admin/coupons/budget — 예산 잔액 조회 (상단 잔액 표시용)
router.get('/budget', async (_req, res) => {
  try {
    const budget = await getOrCreateCouponBudget();
    res.json({ success: true, data: { balance: budget.balance, updatedAt: budget.updatedAt } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /admin/coupons/budget/charge — 예산 충전 { amount, memo? }
router.post('/budget/charge', async (req, res) => {
  try {
    const amountNum = Number(req.body?.amount);
    const memo = req.body?.memo != null ? String(req.body.memo) : null;

    if (!Number.isInteger(amountNum) || amountNum <= 0) {
      res.status(400).json({ success: false, error: 'amount는 1 이상 정수여야 합니다.' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const budget = await tx.couponBudget.findFirst();
      const b = budget ?? (await tx.couponBudget.create({ data: { balance: 0 } }));
      const newBalance = b.balance + amountNum;
      const updated = await tx.couponBudget.update({
        where: { id: b.id },
        data: { balance: newBalance },
      });
      await tx.couponBudgetHistory.create({
        data: {
          budgetId: b.id,
          type: 'charge',
          amount: amountNum,
          balance: newBalance,
          memo: memo ?? undefined,
        },
      });
      return updated;
    });

    res.status(201).json({
      success: true,
      data: { balance: result.balance, updatedAt: result.updatedAt },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /admin/coupons/budget/history — 예산 충전/차감 로그 (기본 최근 20건)
router.get('/budget/history', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));
    const budget = await getOrCreateCouponBudget();

    const items = await prisma.couponBudgetHistory.findMany({
      where: { budgetId: budget.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({
      success: true,
      data: {
        items: items.map((x) => ({
          id: x.id,
          type: x.type,
          amount: x.amount,
          balance: x.balance,
          memo: x.memo,
          createdAt: x.createdAt,
        })),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /admin/coupons/purchases — 쿠폰 적립/구매 내역 (FE: 쿠폰구매현황)
router.get('/purchases', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const q = (req.query.q as string | undefined)?.trim();

    const where =
      q && q.length > 0
        ? {
            OR: [
              {
                user: {
                  is: {
                    OR: [{ phone: { contains: q } }, { name: { contains: q } }],
                  },
                },
              },
              {
                coupon: {
                  is: { code: { contains: q, mode: 'insensitive' as const } },
                },
              },
            ],
          }
        : {};

    const [items, total] = await Promise.all([
      prisma.userCoupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, phone: true, name: true, mileageBalance: true } },
          coupon: { select: { id: true, code: true, amount: true } },
        },
      }),
      prisma.userCoupon.count({ where }),
    ]);

    const dataItems = items.map((uc) => {
      const occurredAt = uc.createdAt;
      const usedYm =
        occurredAt instanceof Date
          ? `${occurredAt.getFullYear()}-${String(occurredAt.getMonth() + 1).padStart(2, '0')}`
          : null;
      return {
        receiptNo: uc.id,
        userId: uc.user.id,
        phone: uc.user.phone,
        amount: uc.coupon.amount,
        balance: uc.user.mileageBalance,
        event: '적립',
        status: 'completed',
        couponCode: uc.coupon.code,
        occurredAt,
        usedYearMonth: usedYm,
      };
    });

    res.json({
      success: true,
      data: { items: dataItems, total, page, limit },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /admin/coupons/history — purchases와 동일 포맷 (FE 폴백용)
router.get('/history', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const q = (req.query.q as string | undefined)?.trim();

    const where =
      q && q.length > 0
        ? {
            OR: [
              {
                user: {
                  is: {
                    OR: [{ phone: { contains: q } }, { name: { contains: q } }],
                  },
                },
              },
              {
                coupon: {
                  is: { code: { contains: q, mode: 'insensitive' as const } },
                },
              },
            ],
          }
        : {};

    const [items, total] = await Promise.all([
      prisma.userCoupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, phone: true, name: true, mileageBalance: true } },
          coupon: { select: { id: true, code: true, amount: true } },
        },
      }),
      prisma.userCoupon.count({ where }),
    ]);

    const dataItems = items.map((uc) => {
      const occurredAt = uc.createdAt;
      const usedYm =
        occurredAt instanceof Date
          ? `${occurredAt.getFullYear()}-${String(occurredAt.getMonth() + 1).padStart(2, '0')}`
          : null;
      return {
        receiptNo: uc.id,
        userId: uc.user.id,
        phone: uc.user.phone,
        amount: uc.coupon.amount,
        balance: uc.user.mileageBalance,
        event: '적립',
        status: 'completed',
        couponCode: uc.coupon.code,
        occurredAt,
        usedYearMonth: usedYm,
      };
    });

    res.json({
      success: true,
      data: { items: dataItems, total, page, limit },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.get('/', async (_req, res) => {
  try {
    const items = await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { userCoupons: true } } },
    });
    res.json({
      success: true,
      data: items.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        type: c.type,
        imageUrl: c.imageUrl,
        amount: c.amount,
        validUntil: c.validUntil,
        createdAt: c.createdAt,
        usedCount: c._count.userCoupons,
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.post('/', async (req, res) => {
  try {
    const { code, amount, validUntil, name, type, imageUrl } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'code 필수' });
    const coupon = await prisma.coupon.create({
      data: {
        code: String(code).trim().toUpperCase(),
        amount: Number(amount) || 0,
        validUntil: validUntil ? new Date(validUntil) : null,
        ...(name != null && { name: String(name).trim() || null }),
        ...(type != null && { type: normalizeCouponType(String(type)) }),
        ...(imageUrl != null && { imageUrl: String(imageUrl).trim() || null }),
      },
    });
    res.status(201).json({ success: true, data: coupon });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { code, amount, validUntil, name, type, imageUrl } = req.body;
    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: {
        ...(code != null && { code: String(code).trim().toUpperCase() }),
        ...(amount != null && { amount: Number(amount) }),
        ...(validUntil != null && { validUntil: validUntil ? new Date(validUntil) : null }),
        ...(name !== undefined && { name: name ? String(name).trim() : null }),
        ...(type !== undefined && { type: normalizeCouponType(String(type)) }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl ? String(imageUrl).trim() : null }),
      },
    });
    res.json({ success: true, data: coupon });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /admin/coupons/send — 선택 회원에게 쿠폰 발송 { userIds: [], couponId }
router.post('/send', async (req, res) => {
  try {
    const { userIds, couponId } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0 || !couponId) {
      res.status(400).json({ success: false, error: 'userIds 배열, couponId 필수' });
      return;
    }
    const couponIdStr = String(couponId).trim();
    const couponById = await prisma.coupon.findUnique({ where: { id: couponIdStr } });
    // FE/운영에서 "쿠폰 ID"를 code로 넣는 케이스 대비 (BE는 id 기준 조회만 하던 부분 보강)
    const couponByCode =
      couponById ??
      (await prisma.coupon.findUnique({
        where: { code: couponIdStr.toUpperCase() },
      }));
    const coupon = couponByCode;
    if (!coupon) {
      res.status(404).json({ success: false, error: '쿠폰을 찾을 수 없습니다.' });
      return;
    }
    const ids = userIds.filter((x: unknown) => typeof x === 'string') as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    const existing = await prisma.userCoupon.findMany({
      where: { userId: { in: users.map((u) => u.id) }, couponId: coupon.id },
      select: { userId: true },
    });
    const existingSet = new Set(existing.map((e) => e.userId));
    let applied = 0;
    for (const u of users) {
      if (existingSet.has(u.id)) continue;
      try {
        await prisma.$transaction([
          prisma.userCoupon.create({
            data: { userId: u.id, couponId: coupon.id },
          }),
        ]);
        applied++;
      } catch {
        // 충돌 시 스킵
      }
    }

    // 예산 차감 (성공 적용된 수만큼)
    if (applied > 0) {
      const spendAmount = coupon.amount * applied;
      await prisma.$transaction(async (tx) => {
        const budget = await tx.couponBudget.findFirst();
        const b = budget ?? (await tx.couponBudget.create({ data: { balance: 0 } }));
        const newBalance = b.balance - spendAmount;
        await tx.couponBudget.update({
          where: { id: b.id },
          data: { balance: newBalance },
        });
        await tx.couponBudgetHistory.create({
          data: {
            budgetId: b.id,
            type: 'spend',
            amount: -spendAmount,
            balance: newBalance,
            memo: `쿠폰 발송 차감: ${coupon.code} x${applied}`,
          },
        });
      });
    }

    res.json({ success: true, data: { sent: applied, total: ids.length } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
