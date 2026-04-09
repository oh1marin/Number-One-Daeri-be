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

/** 앱 사용자는 본인 폴더 `uploads/app/{userId}/` 하위만 */
function assertAppKey(key: unknown, userId: string): string {
  const k = normalizeKey(key);
  const prefix = `uploads/app/${userId}/`;
  if (!k.startsWith(prefix)) {
    throw new Error('INVALID_PREFIX');
  }
  return k;
}

// POST /storage/presign-put — body: { key, contentType }
router.post('/presign-put', async (req, res) => {
  try {
    if (!isS3Configured()) {
      jsonError(res, 503, 'S3 미설정: AWS_S3_BUCKET, AWS_REGION 을 확인하세요.');
      return;
    }
    const userId = req.user?.id;
    if (!userId) {
      jsonError(res, 401, '인증이 필요합니다.');
      return;
    }
    const { key, contentType } = req.body ?? {};
    if (!contentType || typeof contentType !== 'string') {
      jsonError(res, 400, 'contentType 필수');
      return;
    }
    const safeKey = assertAppKey(key, userId);
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
        jsonError(res, 400, `key는 uploads/app/${req.user?.id ?? '…'}/ 로 시작해야 합니다.`);
        return;
      }
    }
    jsonServerError(res, e);
  }
});

// POST /storage/presign-get — body: { key }
router.post('/presign-get', async (req, res) => {
  try {
    if (!isS3Configured()) {
      jsonError(res, 503, 'S3 미설정: AWS_S3_BUCKET, AWS_REGION 을 확인하세요.');
      return;
    }
    const userId = req.user?.id;
    if (!userId) {
      jsonError(res, 401, '인증이 필요합니다.');
      return;
    }
    const safeKey = assertAppKey(req.body?.key, userId);
    const url = await getPresignedGetUrl(safeKey, 3600);
    res.json({ success: true, data: { url, key: safeKey, method: 'GET' as const } });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'INVALID_KEY') {
        jsonError(res, 400, '유효하지 않은 key 입니다.');
        return;
      }
      if (e.message === 'INVALID_PREFIX') {
        jsonError(res, 400, `key는 uploads/app/${req.user?.id ?? '…'}/ 로 시작해야 합니다.`);
        return;
      }
    }
    jsonServerError(res, e);
  }
});

export default router;
