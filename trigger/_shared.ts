import { config } from "dotenv";
import { resolve } from "path";

// Load env vars for Trigger.dev worker process
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { r2, getPublicUrl } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

function logR2(event: string, data: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ source: "r2", event, ...data }));
  } catch {
    console.log(`[r2] ${event}`);
  }
}
function logR2Error(event: string, data: Record<string, unknown>): void {
  try {
    console.error(
      JSON.stringify({ source: "r2", event, level: "error", ...data }),
    );
  } catch {
    console.error(`[r2] ${event} (error)`);
  }
}

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

/**
 * Merge a JSON patch into the asset's `metadata` JSONB column. Performs one
 * level of deep-merge so concurrent additions under the same top-level key
 * (e.g. `externalIds.kieai` + `externalIds.elevenlabs`) coexist without
 * clobbering each other.
 */
export async function appendAssetMetadata(
  assetId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = getServiceClient();
  const { data, error: readErr } = await db
    .from("assets")
    .select("metadata")
    .eq("id", assetId)
    .single();
  if (readErr) {
    console.error(
      JSON.stringify({
        source: "supabase",
        event: "appendAssetMetadata.readError",
        level: "error",
        assetId,
        error: readErr.message,
      }),
    );
    return; // Logging failures shouldn't break the pipeline.
  }
  const current = (data?.metadata as Record<string, unknown> | null) ?? {};
  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    const existing = current[k];
    if (
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing) &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      merged[k] = { ...(existing as object), ...(v as object) };
    } else {
      merged[k] = v;
    }
  }
  const { error: writeErr } = await db
    .from("assets")
    .update({ metadata: merged })
    .eq("id", assetId);
  if (writeErr) {
    console.error(
      JSON.stringify({
        source: "supabase",
        event: "appendAssetMetadata.writeError",
        level: "error",
        assetId,
        error: writeErr.message,
      }),
    );
  }
}

export async function uploadResultToR2(
  outputUrl: string,
  userId: string,
  ext = "jpg"
): Promise<string> {
  const start = Date.now();
  logR2("download.request", { outputUrl, ext });
  let response: Response;
  try {
    response = await fetch(outputUrl);
  } catch (err) {
    logR2Error("download.networkError", {
      outputUrl,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  if (!response.ok) {
    logR2Error("download.httpError", {
      outputUrl,
      status: response.status,
      durationMs: Date.now() - start,
    });
    throw new Error(`uploadResultToR2: download failed ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const byteLength = buffer.byteLength;
  const key = `${userId}/processed/${randomUUID()}.${ext}`;
  const uploadStart = Date.now();
  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: key,
        Body: Buffer.from(buffer),
        ContentType: ext === "mp4" ? "video/mp4" : `image/${ext}`,
      }),
    );
  } catch (err) {
    logR2Error("upload.error", {
      key,
      byteLength,
      durationMs: Date.now() - uploadStart,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  const publicUrl = getPublicUrl(key);
  logR2("upload.success", {
    key,
    byteLength,
    totalMs: Date.now() - start,
    uploadMs: Date.now() - uploadStart,
  });
  return publicUrl;
}
