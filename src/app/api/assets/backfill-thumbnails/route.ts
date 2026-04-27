import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { r2, getPublicUrl } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import sharp from "sharp";

const MAX_PER_REQUEST = 60;
const THUMB_MAX_EDGE = 480;
const THUMB_QUALITY = 78;

interface AssetRow {
  id: string;
  original_url: string;
  user_id: string;
}

async function buildThumbnail(originalUrl: string): Promise<Buffer> {
  const res = await fetch(originalUrl);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return sharp(bytes)
    .rotate()
    .resize({
      width: THUMB_MAX_EDGE,
      height: THUMB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();
}

async function uploadThumb(userId: string, body: Buffer): Promise<string> {
  const key = `${userId}/${randomUUID()}.jpg`;
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: "image/jpeg",
    }),
  );
  return getPublicUrl(key);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string;
  };

  // Scope to the user's own assets (RLS doubles up on this), and optionally
  // narrow to a project. The query is idempotent — re-running returns the
  // remaining assets that still lack a thumbnail.
  let q = supabase
    .from("assets")
    .select("id, original_url, user_id")
    .eq("user_id", user.id)
    .eq("asset_type", "image")
    .is("thumbnail_url", null)
    .not("original_url", "is", null)
    .limit(MAX_PER_REQUEST);
  if (body.projectId) q = q.eq("project_id", body.projectId);
  const { data: rows, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = (rows ?? []).filter(
    (r): r is AssetRow => typeof r.original_url === "string",
  );

  let done = 0;
  let failed = 0;
  for (const asset of targets) {
    try {
      const thumb = await buildThumbnail(asset.original_url);
      const url = await uploadThumb(asset.user_id, thumb);
      const { error: updateErr } = await supabase
        .from("assets")
        .update({ thumbnail_url: url })
        .eq("id", asset.id);
      if (updateErr) throw updateErr;
      done += 1;
    } catch (err) {
      console.warn(
        "[backfill-thumbnails] failed",
        asset.id,
        err instanceof Error ? err.message : err,
      );
      failed += 1;
    }
  }

  return NextResponse.json({
    scanned: targets.length,
    done,
    failed,
    remaining: Math.max(0, targets.length - done) > 0 || targets.length === MAX_PER_REQUEST,
  });
}
