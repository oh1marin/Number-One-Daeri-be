import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const userType = req.query.userType as string | undefined;
    const skip = (page - 1) * limit;
    const where = userType ? { userType } : {};
    const [items, total] = await Promise.all([
      prisma.userLoginLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.userLoginLog.count({ where }),
    ]);
    res.json({ success: true, data: { items, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
