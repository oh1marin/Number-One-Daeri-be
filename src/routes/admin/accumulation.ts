import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

async function getOrCreateAccumulationSettings() {
  let s = await prisma.accumulationSettings.findFirst();
  if (!s) {
    s = await prisma.accumulationSettings.create({
      data: {
        signupBonus: 10000,
        referrerRegister: 2000,
        referrerFirstRide: 3000,
        referrerRideRate: 0.05,
        cardPayRate: 0.05,
        rideEarnRate: 0.10,
      },
    });
  }
  return s;
}

// GET /admin/settings/accumulation
router.get('/', async (_req, res) => {
  try {
    const s = await getOrCreateAccumulationSettings();
    res.json({
      success: true,
      data: {
        signupBonus: s.signupBonus,
        referrerRegister: s.referrerRegister,
        referrerFirstRide: s.referrerFirstRide,
        referrerRideRate: s.referrerRideRate,
        cardPayRate: s.cardPayRate,
        rideEarnRate: s.rideEarnRate ?? 0.10,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /admin/settings/accumulation
router.put('/', async (req, res) => {
  try {
    const { signupBonus, referrerRegister, referrerFirstRide, referrerRideRate, cardPayRate, rideEarnRate } =
      req.body;
    const existing = await getOrCreateAccumulationSettings();
    const updated = await prisma.accumulationSettings.update({
      where: { id: existing.id },
      data: {
        ...(signupBonus != null && { signupBonus: Number(signupBonus) }),
        ...(referrerRegister != null && { referrerRegister: Number(referrerRegister) }),
        ...(referrerFirstRide != null && { referrerFirstRide: Number(referrerFirstRide) }),
        ...(referrerRideRate != null && { referrerRideRate: Number(referrerRideRate) }),
        ...(cardPayRate != null && { cardPayRate: Number(cardPayRate) }),
        ...(rideEarnRate != null && { rideEarnRate: Number(rideEarnRate) }),
      },
    });
    res.json({
      success: true,
      data: {
        signupBonus: updated.signupBonus,
        referrerRegister: updated.referrerRegister,
        referrerFirstRide: updated.referrerFirstRide,
        referrerRideRate: updated.referrerRideRate,
        cardPayRate: updated.cardPayRate,
        rideEarnRate: updated.rideEarnRate ?? 0.10,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
