import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { inferCouponType } from "../../lib/couponDisplay";

const router = Router();

const MIN_BALANCE_FOR_WITHDRAW = 0; // 전액 출금 가능

async function ensureUserCouponDeliveryColumns() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT \'active\''
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "redeemedAt" TIMESTAMP(3)'
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "user_coupons" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3)'
  );
  await prisma.$executeRawUnsafe(
    'UPDATE "user_coupons" SET "status" = \'active\' WHERE "status" IS NULL'
  );
}

// PATCH /users/me — 프로필 수정 (이름 등)
router.patch("/me", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ success: false, error: "name 필수" });
      return;
    }
    await prisma.user.update({
      where: { id: userId },
      data: { name: name.trim().slice(0, 50) },
    });
    res.json({ success: true, data: { name: name.trim().slice(0, 50) } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /users/me/settings — 알림 설정 조회
router.get("/me/settings", async (req, res) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });
    const settings = (user?.settings as Record<string, unknown>) ?? {};
    res.json({
      success: true,
      data: {
        pushEnabled: settings.pushEnabled ?? true,
        ...settings,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PATCH /users/me/settings — 알림 설정 변경
router.patch("/me/settings", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { pushEnabled } = req.body;
    const updates: Record<string, unknown> = {};
    if (typeof pushEnabled === "boolean") updates.pushEnabled = pushEnabled;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ success: false, error: "변경할 설정 없음" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });
    const current = (user?.settings as Record<string, unknown>) ?? {};
    const merged = { ...current, ...updates };

    await prisma.user.update({
      where: { id: userId },
      data: { settings: merged as Prisma.InputJsonValue },
    });
    res.json({ success: true, data: merged });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /users/me — 계정 삭제
router.delete("/me", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return res.status(404).json({ success: false, error: "Not found" });

    if (user.password) {
      const valid = await bcrypt.compare(String(password ?? ""), user.password);
      if (!valid) {
        res
          .status(401)
          .json({ success: false, error: "비밀번호가 일치하지 않습니다." });
        return;
      }
    }
    // 전화번호 가입 유저는 비밀번호 없이 토큰 인증만으로 삭제

    const phoneDigits = user.phone ? String(user.phone).replace(/\D/g, "").trim() : "";

    await prisma.$transaction(async (tx) => {
      // rides는 운영 데이터 보존을 위해 "익명화"(userId null + 연락처 제거)
      await tx.ride.updateMany({
        where: { userId },
        data: { userId: null, phone: null, customerName: "탈퇴회원" },
      });

      // 추천/피추천 관계는 FK 제약 때문에 먼저 정리
      await tx.userReferral.deleteMany({
        where: { OR: [{ referrerId: userId }, { referredId: userId }] },
      });
      await tx.referrerTierBonus.deleteMany({ where: { referrerId: userId } });

      // 세션/토큰/로그
      await tx.userPushToken.deleteMany({ where: { userId } });
      await tx.userRefreshToken.deleteMany({ where: { userId } });
      await tx.userLoginLog.deleteMany({ where: { userId } });

      // 유저 소유 데이터
      await tx.mileageHistory.deleteMany({ where: { userId } });
      await tx.withdrawal.deleteMany({ where: { userId } });
      await tx.userInquiry.deleteMany({ where: { userId } });
      await tx.complaint.deleteMany({ where: { userId } });
      await tx.userCoupon.deleteMany({ where: { userId } });
      await tx.cashReceipt.deleteMany({ where: { userId } });
      await tx.payment.deleteMany({ where: { userId } });
      await tx.userCard.deleteMany({ where: { userId } });

      // phone OTP 정리 (phone 기반)
      if (phoneDigits) {
        await tx.phoneOtp.deleteMany({ where: { phone: phoneDigits } });

        // 앱 가입 시 생성했던 Customer(관리대장)도 best-effort 제거
        await tx.customer.deleteMany({
          where: {
            category: "앱회원",
            OR: [{ phone: phoneDigits }, { mobile: phoneDigits }],
          },
        });
      }

      // 마지막으로 유저 삭제(하드 삭제)
      await tx.user.delete({ where: { id: userId } });
    });

    res.json({ success: true, data: { message: "계정이 삭제되었습니다." } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /users/me/mileage — 마일리지 잔액
router.get("/me/mileage", async (req, res) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user)
      return res.status(404).json({ success: false, error: "Not found" });

    const balance = user.mileageBalance;
    const withdrawable = Math.max(0, balance - MIN_BALANCE_FOR_WITHDRAW);

    res.json({
      success: true,
      data: {
        balance,
        withdrawable,
        /** 순수 마일리지(User.mileageBalance). 쿠폰 금액은 합산하지 않음 — 쿠폰은 GET /users/me/coupons */
        balanceIsMileageOnly: true,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// GET /users/me/coupons — 쿠폰 목록
router.get("/me/coupons", async (req, res) => {
  try {
    const userId = req.user!.id;

    await ensureUserCouponDeliveryColumns();

    const userCoupons = await prisma.userCoupon.findMany({
      where: {
        userId,
        coupon: {
          OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        coupon: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            imageUrl: true,
            amount: true,
            validUntil: true,
            createdAt: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: {
        items: userCoupons.map((uc) => {
          const c = uc.coupon;
          const displayName = (c.name && c.name.trim()) || c.code;
          const type = inferCouponType(c.code, c.name, c.type);
          return {
            id: uc.id,
            code: c.code,
            name: displayName,
            amount: c.amount,
            type,
            imageUrl: c.imageUrl ?? undefined,
            validUntil: c.validUntil,
            receivedAt: uc.createdAt,
            status: uc.status,
            redeemedAt: uc.redeemedAt,
            deliveredAt: uc.deliveredAt,
            // 호환용: 예전 필드명을 쓰는 FE가 있으면 deliveredAt를 usedAt으로도 노출
            usedAt: uc.usedAt ?? uc.deliveredAt ?? null,
          };
        }),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
