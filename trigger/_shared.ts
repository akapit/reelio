import { config } from "dotenv";
import { resolve } from "path";

// Load env vars for Trigger.dev worker process
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { r2, getPublicUrl } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      `Missing Supabase env vars. URL: ${url ? "set" : "MISSING"}, KEY: ${key ? "set" : "MISSING"}. ` +
      `CWD: ${process.cwd()}`
    );
  }
  return createSupabaseClient(url, key);
}

export async function updateAssetStatus(
  assetId: string,
  status: "processing" | "done" | "failed",
  extra?: { processed_url?: string; job_id?: string; original_url?: string }
) {
  const db = getServiceClient();
  await db.from("assets").update({ status, ...extra }).eq("id", assetId);
}

export async function uploadResultToR2(
  outputUrl: string,
  userId: string,
  ext = "jpg"
): Promise<string> {
  const response = await fetch(outputUrl);
  const buffer = await response.arrayBuffer();
  const key = `${userId}/processed/${randomUUID()}.${ext}`;
  await r2.send(new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
    Key: key,
    Body: Buffer.from(buffer),
    ContentType: ext === "mp4" ? "video/mp4" : `image/${ext}`,
  }));
  return getPublicUrl(key);
}
