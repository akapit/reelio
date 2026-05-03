import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_NAMES } from "@/lib/engine/models";
import { loadTemplate } from "@/lib/engine/templates/loader";
import { SEEDANCE_MULTIREF_MAX_IMAGES } from "@/lib/engine/prompt-writer/seedance-multiref";
import {
  estimateVoiceoverSeconds,
  maxVoiceoverSeconds,
} from "@/lib/voiceover-duration";
import {
  hasLogoPlacement,
  isLogoAsset,
  normalizeLogoPlacement,
} from "@/lib/video-logo";
import type { engineGenerateTask } from "../../../../../trigger/engine-generate";
import type { engineGenerateSeedanceTask } from "../../../../../trigger/engine-generate-seedance";

const BodySchema = z.object({
  projectId: z.string().uuid(),
  imageAssetIds: z.array(z.string().uuid()).min(1).max(20),
  templateName: z.enum(TEMPLATE_NAMES),
  /**
   * Generation mode. "scenes" = the default scene-based engine (planner
   * splits into N clips, ffmpeg concats). "seedance" = single-call Seedance
   * 2 with all references in one 4-15s video. Different shape, so we branch
   * on this at dispatch time.
   */
  mode: z.enum(["scenes", "seedance"]).optional(),
  /**
   * Video-generation backend. Optional; server default resolves from
   * ENGINE_VIDEO_PROVIDER env or "kieai". Only applies to mode="scenes".
   */
  videoProvider: z.enum(["piapi", "kieai"]).optional(),
  /**
   * User's video-model selection. When present, every scene is hard-overridden
   * to this choice after the LLM prompt writer returns — the LLM still writes
   * the motion prompt, but doesn't get to pick the model. Omit to let the LLM
   * pick per scene. Only applies to mode="scenes".
   */
  modelChoice: z
    .enum(["kling", "seedance", "seedance-fast", "seedance-1-fast"])
    .optional(),
  /** Target video duration. Scene mode accepts 1-50s; Seedance mode accepts 4-15s. */
  durationSec: z.number().int().min(1).max(50).optional(),
  /** Seedance mode only: output aspect ratio. Default 16:9. */
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  /** Optional ElevenLabs voiceover text (max ~2000 chars). */
  voiceoverText: z.string().max(2000).optional(),
  voiceoverVoiceId: z.string().optional(),
  /** Optional ElevenLabs background-music prompt. Scene mode only. */
  musicPrompt: z.string().max(500).optional(),
  /** Seedance mode only: pick a track from the R2 library for this mood. */
  musicMood: z.enum(["upbeat", "luxury", "calm"]).optional(),
  /** Music loudness 0..1 in the final mix. Default 0.2 at the engine layer. */
  musicVolume: z.number().min(0).max(1).optional(),
  /** Optional reusable logo asset to burn into the final MP4. */
  logoAssetId: z.string().uuid().optional(),
  logoPlacement: z
    .object({
      corner: z.boolean().optional(),
      endCard: z.boolean().optional(),
      cornerPosition: z
        .enum(["top-right", "top-left", "bottom-right", "bottom-left"])
        .optional(),
      endCardDurationSec: z.number().int().min(1).max(8).optional(),
    })
    .optional(),
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
    mode = "scenes",
    videoProvider,
    modelChoice,
    durationSec,
    aspectRatio,
    voiceoverText,
    voiceoverVoiceId,
    musicPrompt,
    musicMood,
    musicVolume,
    logoAssetId,
    logoPlacement,
  } = parsed.data;
  const normalizedLogoPlacement = normalizeLogoPlacement(logoPlacement);

  // Seedance mode: single-call generation caps at 9 references (kie.ai
  // spec). Reject > 9 at the API boundary — the UI also gates this, but the
  // server is the authoritative guard.
  if (mode === "seedance" && imageAssetIds.length > SEEDANCE_MULTIREF_MAX_IMAGES) {
    return NextResponse.json(
      {
        error: `Seedance mode accepts at most ${SEEDANCE_MULTIREF_MAX_IMAGES} images (received ${imageAssetIds.length})`,
      },
      { status: 400 },
    );
  }
  if (
    mode === "seedance" &&
    durationSec !== undefined &&
    (durationSec < 4 || durationSec > 15)
  ) {
    return NextResponse.json(
      { error: "Seedance mode accepts durationSec from 4 to 15 seconds" },
      { status: 400 },
    );
  }
  const effectiveDurationSec =
    durationSec ??
    (mode === "seedance"
      ? Math.min(15, Math.max(4, Math.round(imageAssetIds.length * 3)))
      : loadTemplate(templateName).targetDurationSec);
  if (voiceoverText) {
    const estimatedSec = estimateVoiceoverSeconds(voiceoverText);
    const maxSec = maxVoiceoverSeconds(effectiveDurationSec);
    if (estimatedSec > maxSec) {
      return NextResponse.json(
        {
          error: `Voiceover is too long for this video. Keep it under ${maxSec} seconds or shorten it with AI.`,
          estimatedSec,
          maxVoiceoverSec: maxSec,
        },
        { status: 400 },
      );
    }
  }
  if (logoPlacement && !logoAssetId) {
    return NextResponse.json(
      { error: "logoAssetId is required when logo placement is provided" },
      { status: 400 },
    );
  }
  if (logoAssetId && !hasLogoPlacement(normalizedLogoPlacement)) {
    return NextResponse.json(
      { error: "Choose at least one logo placement" },
      { status: 400 },
    );
  }

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

  let logo:
    | {
        assetId: string;
        url: string;
        placement: typeof normalizedLogoPlacement;
      }
    | undefined;
  if (logoAssetId) {
    const { data: logoAsset, error: logoErr } = await supabase
      .from("assets")
      .select("id, user_id, project_id, original_url, processed_url, asset_type, metadata")
      .eq("id", logoAssetId)
      .single();
    if (logoErr || !logoAsset) {
      return NextResponse.json({ error: "Logo asset not found" }, { status: 404 });
    }
    if (logoAsset.user_id !== user.id || logoAsset.project_id !== projectId) {
      return NextResponse.json({ error: "Logo asset not accessible" }, { status: 403 });
    }
    if (logoAsset.asset_type !== "image") {
      return NextResponse.json(
        { error: "Logo asset must be an image" },
        { status: 400 },
      );
    }
    if (!isLogoAsset(logoAsset)) {
      return NextResponse.json(
        { error: "Selected logo asset is not marked as a logo" },
        { status: 400 },
      );
    }
    const logoUrl = logoAsset.processed_url ?? logoAsset.original_url;
    if (!logoUrl) {
      return NextResponse.json(
        { error: "Logo asset has no usable URL" },
        { status: 400 },
      );
    }
    logo = {
      assetId: logoAsset.id,
      url: logoUrl,
      placement: normalizedLogoPlacement,
    };
  }

  const { data: sourceAssets, error: assetsErr } = await supabase
    .from("assets")
    .select("id, user_id, project_id, original_url, processed_url, thumbnail_url, asset_type, metadata")
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
    if (isLogoAsset(a)) {
      return NextResponse.json(
        { error: `Asset ${a.id} is a logo, not a listing photo` },
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
      // Use the source image's lightweight thumbnail (≤480px JPEG) so video
      // cards have a real poster the moment they render. Without this, the
      // browser starts decoding the 1080p mp4 just to show the first frame,
      // which makes the grid feel slow and laggy on first paint.
      thumbnail_url: firstAsset.thumbnail_url ?? firstAsset.original_url,
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
          mode,
          templateName,
          imageAssetIds,
          ...(videoProvider ? { videoProvider } : {}),
          ...(modelChoice ? { modelChoice } : {}),
          ...(durationSec !== undefined ? { durationSec } : {}),
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(voiceoverText ? { voiceoverText } : {}),
          ...(voiceoverVoiceId ? { voiceoverVoiceId } : {}),
          ...(musicPrompt ? { musicPrompt } : {}),
          ...(musicMood ? { musicMood } : {}),
          ...(musicVolume !== undefined ? { musicVolume } : {}),
          ...(logo
            ? {
                logo: {
                  assetId: logo.assetId,
                  placement: logo.placement,
                },
              }
            : {}),
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
    if (mode === "seedance") {
      await tasks.trigger<typeof engineGenerateSeedanceTask>(
        "engine-generate-seedance",
        {
          assetId: placeholder.id,
          userId: user.id,
          projectId,
          imageUrls: imageUrls as string[],
          // Mood hint doubles as context for the prompt writer; pass the
          // template name through so we keep one knob in the UI.
          mood: templateName,
          ...(durationSec !== undefined ? { durationSec } : {}),
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(voiceoverText ? { voiceoverText } : {}),
          ...(voiceoverVoiceId ? { voiceoverVoiceId } : {}),
          ...(musicMood ? { musicMood } : {}),
          ...(musicVolume !== undefined ? { musicVolume } : {}),
          ...(logo
            ? {
                logo: {
                  assetId: logo.assetId,
                  url: logo.url,
                  placement: logo.placement,
                },
              }
            : {}),
        },
      );
    } else {
      await tasks.trigger<typeof engineGenerateTask>("engine-generate", {
        assetId: placeholder.id,
        userId: user.id,
        projectId,
        imageUrls: imageUrls as string[],
        templateName,
        ...(videoProvider ? { videoProvider } : {}),
        ...(modelChoice ? { modelChoice } : {}),
        ...(durationSec !== undefined ? { durationSec } : {}),
        ...(voiceoverText ? { voiceoverText } : {}),
        ...(voiceoverVoiceId ? { voiceoverVoiceId } : {}),
        ...(musicPrompt ? { musicPrompt } : {}),
        ...(musicVolume !== undefined ? { musicVolume } : {}),
        ...(logo
          ? {
              logo: {
                assetId: logo.assetId,
                url: logo.url,
                placement: logo.placement,
              },
            }
          : {}),
      });
    }
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
