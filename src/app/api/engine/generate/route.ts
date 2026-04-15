import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_NAMES } from "@/lib/engine/models";
import type { engineGenerateTask } from "../../../../../trigger/engine-generate";

const BodySchema = z.object({
  projectId: z.string().uuid(),
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
  const { projectId, imageAssetIds, templateName } = parsed.data;

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();
  if (projectErr || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: sourceAssets, error: assetsErr } = await supabase
    .from("assets")
    .select("id, user_id, project_id, original_url, processed_url, asset_type")
    .in("id", imageAssetIds);
  if (assetsErr) {
    console.error("[engine/generate] Failed to load source assets:", assetsErr);
    return NextResponse.json({ error: "Failed to load source assets" }, { status: 500 });
  }
  if (!sourceAssets || sourceAssets.length !== imageAssetIds.length) {
    return NextResponse.json({ error: "One or more source assets not found" }, { status: 404 });
  }
  const byId = new Map(sourceAssets.map((a) => [a.id, a]));
  const orderedAssets = imageAssetIds.map((id) => byId.get(id)!);
  for (const a of orderedAssets) {
    if (a.user_id !== user.id || a.project_id !== projectId) {
      return NextResponse.json({ error: `Asset ${a.id} not accessible` }, { status: 403 });
    }
    if (a.asset_type && a.asset_type !== "image") {
      return NextResponse.json(
        { error: `Asset ${a.id} is a ${a.asset_type}, not an image` },
        { status: 400 },
      );
    }
  }

  // Prefer processed_url (enhanced/staged) if present, fall back to original.
  const imageUrls = orderedAssets.map((a) => a.processed_url ?? a.original_url);
  if (imageUrls.some((u) => !u)) {
    return NextResponse.json(
      { error: "One or more source assets has no resolvable URL" },
      { status: 400 },
    );
  }

  const firstAsset = orderedAssets[0];
  const { data: placeholder, error: insertErr } = await supabase
    .from("assets")
    .insert({
      project_id: projectId,
      user_id: user.id,
      original_url: firstAsset.original_url,
      asset_type: "video",
      status: "processing",
      tool_used: "engine",
      thumbnail_url: firstAsset.original_url,
      source_asset_id: firstAsset.id,
      metadata: {
        engineRequest: { templateName, imageAssetIds },
      },
    })
    .select()
    .single();
  if (insertErr || !placeholder) {
    console.error("[engine/generate] Failed to insert placeholder:", insertErr);
    return NextResponse.json({ error: "Failed to start processing" }, { status: 500 });
  }

  try {
    await tasks.trigger<typeof engineGenerateTask>("engine-generate", {
      assetId: placeholder.id,
      userId: user.id,
      imageUrls: imageUrls as string[],
      templateName,
    });
  } catch (err) {
    console.error("[engine/generate] Failed to trigger task:", err);
    await supabase.from("assets").delete().eq("id", placeholder.id);
    return NextResponse.json(
      { error: "Failed to dispatch engine task" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, resultAssetId: placeholder.id }, { status: 202 });
}
