import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const router = Router();

// POST /complaints — 로그인 사용자 불편신고 (DB 저장, web-admin에서 목록 조회)
router.post('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { type, content, rideId, attachments } = req.body;

    if (!content) {
      res.status(400).json({ success: false, error: 'content 필수' });
      return;
    }

    const complaint = await prisma.complaint.create({
      data: {
        userId,
        type: type != null && String(type).trim() ? String(type).trim() : null,
        content: String(content),
        rideId: rideId != null && String(rideId).trim() ? String(rideId).trim() : null,
        ...(attachments != null && { attachments: attachments as Prisma.InputJsonValue }),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: complaint.id,
        status: complaint.status,
        createdAt: complaint.createdAt,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
