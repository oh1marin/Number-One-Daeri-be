import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { buildListHandler } from './users';

const router = Router();

router.get('/', buildListHandler());

// DELETE /admin/app-install/referrer — 선택 회원 추천인 관계 제거 { ids: [] }
router.delete('/referrer', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: 'ids 배열 필수' });
      return;
    }
    const result = await prisma.userReferral.deleteMany({
      where: { referredId: { in: ids as string[] } },
    });
    res.json({ success: true, data: { deleted: result.count } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
