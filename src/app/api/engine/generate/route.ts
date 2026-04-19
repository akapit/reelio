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
  /**
   * Video-generation backend. Optional; server default resolves from
   * ENGINE_VIDEO_PROVIDER env or "kieai".
   */
  videoProvider: z.enum(["piapi", "kieai"]).optional(),
  /**
   * User's video-model selection. When present, every scene is hard-overridden
   * to this choice after the LLM prompt writer returns — the LLM still writes
   * the motion prompt, but doesn't get to pick the model. Omit to let the LLM
   * pick per scene.
   */
  modelChoice: z.enum(["kling", "seedance", "seedance-fast"]).optional(),
  /** Optional ElevenLabs voiceover text (max ~2000 chars). */
  voiceoverText: z.string().max(2000).optional(),
  voiceoverVoiceId: z.string().optional(),
  /** Optional ElevenLabs background-music prompt. */
  musicPrompt: z.string().max(500).optional(),
  /** Music loudness 0..1 in the final mix. Default 0.2 at the engine layer. */
  musicVolume: z.number().min(0).max(1).optional(),
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
  const {
    projectId,
    imageAssetIds,
    templateName,
    videoProvider,
    modelChoice,
    voiceoverText,
    voiceoverVoiceId,
    musicPrompt,
    musicVolume,
  } = parsed.data;

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
      // `tool_used` is constrained to enhance|staging|sky|video in the DB
      // (supabase/migrations/001_initial.sql). The engine is a video-producing
      // tool, so "video" is the correct bucket. The scene-based lineage lives
      // in `metadata.engineRequest` / `engine_runs`.
      tool_used: "video",
      thumbnail_url: firstAsset.original_url,
      source_asset_id: firstAsset.id,
      metadata: {
        // Mirror the reference ids at the top level so the AssetGrid preview
        // modal (and the re-run preload on CreationBar) can reconstruct the
        // full source-image strip for an in-flight run. Without this, an
        // in-progress processing card would only surface the primary
        // (source_asset_id) and the user couldn't see which other photos they
        // attached until the run completed. The list excludes the primary
        // to match the shape the modal already reads for finished videos.
        referenceAssetIds: imageAssetIds.slice(1),
        engineRequest: {
          templateName,
          imageAssetIds,
          ...(videoProvider ? { videoProvider } : {}),
          ...(modelChoice ? { modelChoice } : {}),
          ...(voiceoverText ? { voiceoverText } : {}),
          ...(voiceoverVoiceId ? { voiceoverVoiceId } : {}),
          ...(musicPrompt ? { musicPrompt } : {}),
          ...(musicVolume !== undefined ? { musicVolume } : {}),
        },
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
      projectId,
      imageUrls: imageUrls as string[],
      templateName,
      ...(videoProvider ? { videoProvider } : {}),
      ...(modelChoice ? { modelChoice } : {}),
      ...(voiceoverText ? { voiceoverText } : {}),
      ...(voiceoverVoiceId ? { voiceoverVoiceId } : {}),
      ...(musicPrompt ? { musicPrompt } : {}),
      ...(musicVolume !== undefined ? { musicVolume } : {}),
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
