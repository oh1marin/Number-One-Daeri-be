import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const region = process.env.AWS_REGION?.trim() || 'ap-northeast-2';
const bucket = process.env.AWS_S3_BUCKET?.trim() || '';

let client: S3Client | null = null;

export function isS3Configured(): boolean {
  return Boolean(bucket && region);
}

export function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({ region });
  }
  return client;
}

export function getBucketName(): string {
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET is not set');
  }
  return bucket;
}

/** 퍼블릭 읽기 버킷일 때 정적 URL (비공개 버킷이면 presigned GET 사용) */
export function publicObjectUrl(key: string): string {
  const b = getBucketName();
  const safeKey = key.split('/').map(encodeURIComponent).join('/');
  return `https://${b}.s3.${region}.amazonaws.com/${safeKey}`;
}

export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 3600
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getS3Client(), cmd, { expiresIn: expiresInSeconds });
}

export async function getPresignedGetUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });
  return getSignedUrl(getS3Client(), cmd, { expiresIn: expiresInSeconds });
}
