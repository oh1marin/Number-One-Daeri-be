import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const items = await prisma.appImage.findMany({ orderBy: { key: 'asc' } });
    const map = Object.fromEntries(items.map((i) => [i.key, i.url ?? '']));
    res.json({ success: true, data: map });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

router.put('/', async (req, res) => {
  try {
    const body = req.body as Record<string, string>;
    if (typeof body !== 'object' || body === null) {
      res.status(400).json({ success: false, error: 'key-value object required' });
      return;
    }
    for (const [key, url] of Object.entries(body)) {
      if (!key || typeof key !== 'string') continue;
      await prisma.appImage.upsert({
        where: { key },
        create: { key, url: url ?? null },
        update: { url: url ?? null },
      });
    }
    const items = await prisma.appImage.findMany({ orderBy: { key: 'asc' } });
    const map = Object.fromEntries(items.map((i) => [i.key, i.url ?? '']));
    res.json({ success: true, data: map });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
