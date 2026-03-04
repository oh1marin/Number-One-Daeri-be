import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /attendance — 월별 조회 (?year=2026&month=3)
router.get('/', async (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!year || !month) {
      return res.status(400).json({
        success: false,
        error: 'year, month query required',
      });
    }

    const entries = await prisma.attendance.findMany({
      where: { year, month },
      include: {
        driver: { select: { id: true, name: true, no: true } },
      },
      orderBy: [{ driverId: 'asc' }, { day: 'asc' }],
    });

    res.json({ success: true, data: entries });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /attendance — 단일 셀 저장
router.post('/', async (req, res) => {
  try {
    const { driverId, year, month, day, status } = req.body;
    if (!driverId || !year || !month || !day) {
      return res.status(400).json({
        success: false,
        error: 'driverId, year, month, day required',
      });
    }

    const entry = await prisma.attendance.upsert({
      where: {
        driverId_year_month_day: {
          driverId,
          year: Number(year),
          month: Number(month),
          day: Number(day),
        },
      },
      create: {
        driverId,
        year: Number(year),
        month: Number(month),
        day: Number(day),
        status: status ?? '',
      },
      update: { status: status ?? '' },
    });
    res.status(201).json({ success: true, data: entry });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// PUT /attendance/:driverId/:year/:month — 월 전체 upsert
router.put('/:driverId/:year/:month', async (req, res) => {
  try {
    const { driverId, year, month } = req.params;
    const { entries } = req.body; // Record<number, string> day -> status

    if (!entries || typeof entries !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Body must include entries: { 1: "0", 2: "지", ... }',
      });
    }

    const yearNum = Number(year);
    const monthNum = Number(month);
    const created = [];

    for (const [dayStr, status] of Object.entries(entries)) {
      const day = Number(dayStr);
      if (day < 1 || day > 31) continue;

      const entry = await prisma.attendance.upsert({
        where: {
          driverId_year_month_day: {
            driverId,
            year: yearNum,
            month: monthNum,
            day,
          },
        },
        create: { driverId, year: yearNum, month: monthNum, day, status: String(status ?? '') },
        update: { status: String(status ?? '') },
      });
      created.push(entry);
    }

    res.json({ success: true, data: created });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

// DELETE /attendance/:driverId/:year/:month
router.delete('/:driverId/:year/:month', async (req, res) => {
  try {
    const { driverId, year, month } = req.params;
    const result = await prisma.attendance.deleteMany({
      where: {
        driverId,
        year: Number(year),
        month: Number(month),
      },
    });
    res.json({ success: true, data: { deleted: result.count } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
