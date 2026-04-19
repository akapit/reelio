/**
 * Pre-flight for the engine: given a batch of source image asset ids and a
 * template, runs vision-only analysis (Google Cloud Vision room classifier +
 * Claude VLM quality pass) and returns a compact report the UI can show
 * before actually dispatching the generation.
 *
 * Response:
 * {
 *   usableCount: number,
 *   slotCount: number,
 *   images: Array<{
 *     assetId: string,
 *     url: string,
 *     roomType: RoomType,
 *     usable: boolean,
 *     reason?: string,
 *   }>,
 * }
 *
 * The caller (CreationBar) uses `usableCount < imageAssetIds.length` to show
 * a "skipped" panel with reasons and a Proceed/Re-upload/Cancel control set.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { analyzeImages } from "@/lib/engine/vision/analyzer";
import {
  TEMPLATE_NAMES,
  TEMPLATE_SLOT_COUNTS,
  type TemplateName,
} from "@/lib/engine/models";

const BodySchema = z.object({
  imageAssetIds: z.array(z.string().uuid()).min(1).max(20),
  templateName: z.enum(TEMPLATE_NAMES),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { imageAssetIds, templateName } = parsed.data;

  const { data: assets, error: assetsErr } = await supabase
    .from("assets")
    .select("id, user_id, original_url, processed_url, asset_type")
    .in("id", imageAssetIds);
  if (assetsErr) {
    console.error("[engine/preflight] loadAssets failed", assetsErr);
    return NextResponse.json({ error: "Failed to load assets" }, { status: 500 });
  }
  if (!assets || assets.length !== imageAssetIds.length) {
    return NextResponse.json({ error: "One or more assets not found" }, { status: 404 });
  }
  const byId = new Map(assets.map((a) => [a.id, a]));
  const ordered = imageAssetIds.map((id) => byId.get(id)!);
  for (const a of ordered) {
    if (a.user_id !== user.id) {
      return NextResponse.json({ error: `Asset ${a.id} not accessible` }, { status: 403 });
    }
    if (a.asset_type && a.asset_type !== "image") {
      return NextResponse.json(
        { error: `Asset ${a.id} is a ${a.asset_type}, not an image` },
        { status: 400 },
      );
    }
  }

  const imageUrls = ordered.map((a) => a.processed_url ?? a.original_url);
  if (imageUrls.some((u) => !u)) {
    return NextResponse.json(
      { error: "One or more assets has no resolvable URL" },
      { status: 400 },
    );
  }

  const urlsStrict = imageUrls as string[];

  try {
    const dataset = await analyzeImages(urlsStrict);
    // `analyzeImages` returns the images in the same order as the URLs it
    // received — safe to zip back to asset ids.
    const urlToMeta = new Map(
      dataset.images.map((m) => [m.path, m]),
    );
    const images = ordered.map((a, i) => {
      const url = urlsStrict[i];
      const meta = urlToMeta.get(url);
      return {
        assetId: a.id,
        url,
        roomType: meta?.roomType ?? "other",
        usable: meta?.usable ?? false,
        ...(meta?.reason ? { reason: meta.reason } : {}),
      };
    });
    const usableCount = images.filter((i) => i.usable).length;
    const slotCount = TEMPLATE_SLOT_COUNTS[templateName as TemplateName];
    return NextResponse.json({
      usableCount,
      slotCount,
      images,
    });
  } catch (err) {
    console.error("[engine/preflight] analyze failed", err);
    return NextResponse.json(
      {
        error: "Pre-flight vision failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
