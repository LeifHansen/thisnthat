// Cloudflare R2 image storage (S3-compatible API), gated on the R2_* env vars.
//
// Listing photos upload here and are served from the bucket's public host.
// When R2 isn't configured, callers fall back to local /public/uploads (dev).
// Uses aws4fetch for SigV4 signing — no heavyweight AWS SDK, matching the
// raw-fetch approach used for Gemini.

import { AwsClient } from "aws4fetch";
import { randomUUID } from "node:crypto";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const publicHost = process.env.R2_PUBLIC_HOST;

export const isR2Configured = Boolean(
  accountId && accessKeyId && secretAccessKey && bucket && publicHost,
);

let client: AwsClient | null = null;
function getClient(): AwsClient | null {
  if (!isR2Configured) return null;
  if (!client) {
    client = new AwsClient({
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      region: "auto", // R2 uses a single "auto" region
      service: "s3",
    });
  }
  return client;
}

const endpoint = () => `https://${accountId}.r2.cloudflarestorage.com`;

function extOf(name: string): string {
  const e = (name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return e || "jpg";
}

// Upload a file to R2 under listings/<uuid>.<ext>; returns the public URL, or
// null if R2 isn't configured (caller falls back to local storage).
export async function uploadToR2(file: File): Promise<string | null> {
  const c = getClient();
  if (!c) return null;
  const key = `listings/${randomUUID()}.${extOf(file.name)}`;
  const body = new Uint8Array(await file.arrayBuffer());
  const res = await c.fetch(`${endpoint()}/${bucket}/${key}`, {
    method: "PUT",
    body,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!res.ok) {
    throw new Error(`R2 upload failed: ${res.status} ${await res.text().catch(() => "")}`.trim());
  }
  return `https://${publicHost}/${key}`;
}

// Lightweight credential/bucket probe for the preflight check: list one object.
export async function r2Reachable(): Promise<void> {
  const c = getClient();
  if (!c) throw new Error("R2 not configured");
  const res = await c.fetch(`${endpoint()}/${bucket}?list-type=2&max-keys=1`, { method: "GET" });
  if (!res.ok) throw new Error(`R2 ${res.status}`);
}
