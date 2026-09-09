import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 client (S3-compatible).
 * Configure via env vars:
 *   R2_ACCOUNT_ID         — your Cloudflare account id
 *   R2_ACCESS_KEY_ID      — R2 API token access key
 *   R2_SECRET_ACCESS_KEY  — R2 API token secret
 *   R2_BUCKET             — bucket name (e.g. beaniexchange-uploads)
 *   R2_PUBLIC_URL         — public URL prefix (e.g. https://pub-xxx.r2.dev
 *                           or https://images.beaniexchange.com)
 */

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

export const R2_BUCKET = process.env.R2_BUCKET ?? "";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(
  /\/+$/,
  "",
);

export function isR2Configured(): boolean {
  return Boolean(
    accountId &&
      accessKeyId &&
      secretAccessKey &&
      R2_BUCKET &&
      R2_PUBLIC_URL,
  );
}

let _client: S3Client | null = null;

export function r2Client(): S3Client {
  if (!_client) {
    if (!isR2Configured()) {
      throw new Error("R2 not configured");
    }
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId as string,
        secretAccessKey: secretAccessKey as string,
      },
    });
  }
  return _client;
}

export function publicUrlFor(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}
