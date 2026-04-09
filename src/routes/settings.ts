import { Router } from 'express';
import { prisma } from '../lib/prisma';
import accumulation from './admin/accumulation';

const router = Router();

// GET /settings/fares
router.get('/fares', async (req, res) => {
  try {
    let settings = await prisma.fareSettings.findFirst();
    if (!settings) {
      settings = await prisma.fareSettings.create({
        data: {
          areas: [],
          fares: {},
        },
      });
    }
    res.json({
      success: true,
      data: {
        areas: settings.areas as string[],
        fares: settings.fares as Record<string, Record<string, number>>,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /settings/fares
router.put('/fares', async (req, res) => {
  try {
    const { areas, fares } = req.body;
    let settings = await prisma.fareSettings.findFirst();
    if (!settings) {
      settings = await prisma.fareSettings.create({
        data: {
          areas: areas ?? [],
          fares: fares ?? {},
        },
      });
    } else {
      settings = await prisma.fareSettings.update({
        where: { id: settings.id },
        data: {
          areas: areas ?? settings.areas,
          fares: fares ?? settings.fares,
        },
      });
    }
    res.json({
      success: true,
      data: {
        areas: settings.areas as string[],
        fares: settings.fares as Record<string, Record<string, number>>,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.use('/accumulation', accumulation);

export default router;
