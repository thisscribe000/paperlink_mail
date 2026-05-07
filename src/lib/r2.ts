import type { R2Bucket, R2HTTPMetadata } from '@cloudflare/workers-types';

export interface UploadOptions {
  key: string;
  data: ArrayBuffer;
  mimeType: string;
  httpMetadata?: R2HTTPMetadata;
}

export async function uploadFile(
  bucket: R2Bucket,
  options: UploadOptions
): Promise<R2Object> {
  return bucket.put(options.key, options.data, {
    httpMetadata: {
      contentType: options.mimeType,
    },
  });
}

export async function getFile(bucket: R2Bucket, key: string): Promise<R2Object | null> {
  return bucket.get(key);
}

export async function deleteFile(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

export async function headFile(bucket: R2Bucket, key: string): Promise<R2Object | null> {
  return bucket.head(key);
}

export function fileKey(slug: string): string {
  return `files/${slug}`;
}