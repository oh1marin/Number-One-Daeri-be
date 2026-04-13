import { randomUUID } from 'crypto';
import { Router } from 'express';
import { jsonError, jsonServerError } from '../../lib/jsonError';
import { getPresignedPutUrl, isS3Configured, publicObjectUrl } from '../../lib/s3';

const router = Router();

/** PutObject Content-Type 과 확장자 (브라우저 PUT 시 동일 헤더 필요) */
const IMAGE_EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function normalizeContentType(raw: unknown): string {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (t === 'image/jpg') return 'image/jpeg';
  return t;
}

/** S3 객체 키 접두(폴더). .. / 절대경로 / 이상 문자 금지 */
function normalizePresignPath(raw: unknown): string {
  const s = String(raw ?? 'uploads/admin')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!s || s.includes('..')) {
    throw new Error('INVALID_PATH');
  }
  const parts = s.split('/').filter(Boolean);
  if (parts.length === 0 || parts.length > 10) {
    throw new Error('INVALID_PATH');
  }
  for (const p of parts) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(p)) {
      throw new Error('INVALID_PATH');
    }
  }
  return parts.join('/');
}

function isCredentialsError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const name = (e as { name?: string }).name ?? '';
  const msg = String((e as { message?: string }).message ?? e);
  return (
    name === 'CredentialsProviderError' ||
    name === 'TokenProviderError' ||
    /credentials|Could not load credentials|EC2 Metadata/i.test(msg)
  );
}

// POST /admin/uploads/presign — body: { contentType, filename, presignPath? }
// filename 은 로깅·클라이언트 관례용; 실제 키는 UUID + contentType 기준 확장자
router.post('/presign', async (req, res) => {
  try {
    if (!isS3Configured()) {
      jsonError(res, 503, 'S3 미설정: AWS_S3_BUCKET, AWS_REGION 을 확인하세요.');
      return;
    }
    const { filename, presignPath } = req.body ?? {};
    const contentType = normalizeContentType(req.body?.contentType);

    if (!filename || typeof filename !== 'string' || !filename.trim()) {
      jsonError(res, 400, 'filename 필수');
      return;
    }
    if (!contentType || !IMAGE_EXT_BY_TYPE[contentType]) {
      jsonError(res, 400, 'contentType 은 image/jpeg, image/png, image/webp, image/gif 중 하나여야 합니다.');
      return;
    }

    let prefix: string;
    try {
      prefix = normalizePresignPath(presignPath);
    } catch {
      jsonError(res, 400, 'presignPath 가 올바르지 않습니다.');
      return;
    }

    const ext = IMAGE_EXT_BY_TYPE[contentType];
    const key = `${prefix}/${randomUUID()}${ext}`;
    const putUrl = await getPresignedPutUrl(key, contentType, 3600);
    const publicUrl = publicObjectUrl(key);

    res.json({
      success: true,
      putUrl,
      publicUrl,
      data: { putUrl, publicUrl, key, contentType },
    });
  } catch (e) {
    console.error('[admin/uploads/presign]', e);
    if (isCredentialsError(e)) {
      jsonError(
        res,
        503,
        'S3 서명에 쓸 AWS 자격 증명이 없습니다. EC2 인스턴스에 IAM 역할(s3:PutObject 등)을 붙이거나, 서버 환경에 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 를 설정하세요.'
      );
      return;
    }
    jsonServerError(res, e);
  }
});

export default router;
