import { Router } from 'express';
import { jsonError, jsonServerError } from '../../lib/jsonError';
import { getPresignedGetUrl, getPresignedPutUrl, isS3Configured } from '../../lib/s3';

const router = Router();

function normalizeKey(raw: unknown): string {
  const k = String(raw ?? '')
    .trim()
    .replace(/^\/+/, '');
  if (!k || k.includes('..') || k.includes('\\')) {
    throw new Error('INVALID_KEY');
  }
  return k;
}

/** 관리자 업로드는 `uploads/admin/` 하위만 허용 */
function assertAdminKey(key: string): string {
  const k = normalizeKey(key);
  if (!k.startsWith('uploads/admin/')) {
    throw new Error('INVALID_PREFIX');
  }
  return k;
}

// POST /admin/storage/presign-put — body: { key, contentType }
router.post('/presign-put', async (req, res) => {
  try {
    if (!isS3Configured()) {
      jsonError(res, 503, 'S3 미설정: AWS_S3_BUCKET, AWS_REGION 을 확인하세요.');
      return;
    }
    const { key, contentType } = req.body ?? {};
    if (!contentType || typeof contentType !== 'string') {
      jsonError(res, 400, 'contentType 필수');
      return;
    }
    const safeKey = assertAdminKey(key);
    const url = await getPresignedPutUrl(safeKey, contentType.trim(), 3600);
    res.json({
      success: true,
      data: {
        url,
        key: safeKey,
        method: 'PUT' as const,
        headers: { 'Content-Type': contentType.trim() },
      },
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'INVALID_KEY') {
        jsonError(res, 400, '유효하지 않은 key 입니다.');
        return;
      }
      if (e.message === 'INVALID_PREFIX') {
        jsonError(res, 400, 'key는 uploads/admin/ 로 시작해야 합니다.');
        return;
      }
    }
    jsonServerError(res, e);
  }
});

// POST /admin/storage/presign-get — body: { key } (비공개 객체 임시 조회용)
router.post('/presign-get', async (req, res) => {
  try {
    if (!isS3Configured()) {
      jsonError(res, 503, 'S3 미설정: AWS_S3_BUCKET, AWS_REGION 을 확인하세요.');
      return;
    }
    const safeKey = assertAdminKey(req.body?.key);
    const url = await getPresignedGetUrl(safeKey, 3600);
    res.json({ success: true, data: { url, key: safeKey, method: 'GET' as const } });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'INVALID_KEY') {
        jsonError(res, 400, '유효하지 않은 key 입니다.');
        return;
      }
      if (e.message === 'INVALID_PREFIX') {
        jsonError(res, 400, 'key는 uploads/admin/ 로 시작해야 합니다.');
        return;
      }
    }
    jsonServerError(res, e);
  }
});

export default router;
