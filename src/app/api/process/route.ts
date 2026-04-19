import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { enhanceImageTask } from "../../../../trigger/enhance-image";
import type { VideoModel } from "@/lib/media/types";

/**
 * NOTE: `tool: "video"` is no longer served here. Video generation now flows
 * through `/api/engine/generate` → `trigger/engine-generate.ts` (scene-based
 * engine). This route remains for image enhancement + staging + sky tools.
 */
type Tool = "enhance" | "staging" | "sky";

const VALID_TOOLS: Tool[] = ["enhance", "staging", "sky"];

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

  const { assetId, tool, prompt, duration, aspectRatio, quality, voiceoverText, musicPrompt, musicVolume, videoModel, referenceAssetIds, effectId, effectPhrases } = body as {
    assetId?: string;
    tool?: string;
    prompt?: string;
    duration?: number;
    aspectRatio?: string;
    quality?: string;
    voiceoverText?: string;
    musicPrompt?: string;
    musicVolume?: number;
    videoModel?: string;
    referenceAssetIds?: string[];
    effectId?: string;
    effectPhrases?: unknown;
  };

  // Normalize the effect payload. Effects must never block a generation, so a
  // malformed payload silently falls back to "no effect" instead of 400ing.
  // Shape: `{ opener: string, transition?: string, closer?: string }`.
  let resolvedEffectPhrases:
    | { opener: string; transition?: string; closer?: string }
    | undefined;
  if (
    effectPhrases &&
    typeof effectPhrases === "object" &&
    !Array.isArray(effectPhrases)
  ) {
    const ep = effectPhrases as {
      opener?: unknown;
      transition?: unknown;
      closer?: unknown;
    };
    if (typeof ep.opener === "string" && ep.opener.length > 0) {
      resolvedEffectPhrases = {
        opener: ep.opener,
        ...(typeof ep.transition === "string"
          ? { transition: ep.transition }
          : {}),
        ...(typeof ep.closer === "string" ? { closer: ep.closer } : {}),
      };
    }
  }
  const resolvedEffectId =
    typeof effectId === "string" && effectId.length > 0 ? effectId : undefined;

  const VALID_VIDEO_MODELS: readonly VideoModel[] = [
    "kling",
    "seedance",
    "seedance-fast",
  ];
  const resolvedVideoModel: VideoModel | undefined =
    videoModel && (VALID_VIDEO_MODELS as readonly string[]).includes(videoModel)
      ? (videoModel as VideoModel)
      : undefined;

  if (!assetId || typeof assetId !== "string") {
    return NextResponse.json(
      { error: "assetId is required and must be a string" },
      { status: 400 }
    );
  }

  if (!tool || !VALID_TOOLS.includes(tool as Tool)) {
    return NextResponse.json(
      { error: `tool must be one of: ${VALID_TOOLS.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify the source asset belongs to the authenticated user
  const { data: asset, error: fetchError } = await supabase
    .from("assets")
    .select("id, user_id, project_id, status, original_url, asset_type")
    .eq("id", assetId)
    .single();

  if (fetchError || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (asset.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Kling i2v and Seedance i2v require an image source. Catch mismatches
  // (e.g. a video dragged into the CreationBar) here with a clear 400
  // instead of letting kie.ai reject with an opaque "File type not
  // supported" inside the retry loop.
  if (tool === "video" && asset.asset_type && asset.asset_type !== "image") {
    return NextResponse.json(
      {
        error: `Video generation requires an image source, but asset ${asset.id} is a ${asset.asset_type}. Select an image instead.`,
      },
      { status: 400 },
    );
  }

  // The source image URL's extension is what kie.ai's file-type sniffer
  // trips on. Our UI accepts HEIC/GIF/video extensions at upload time (so
  // users can store them for later tools), but Kling 2.6 i2v only accepts
  // JPEG/PNG/WebP. Reject with 400 up front so the trigger worker never
  // fires a doomed fan-out.
  if (tool === "video" && typeof asset.original_url === "string") {
    const extMatch = asset.original_url
      .toLowerCase()
      .match(/\.([a-z0-9]+)(?:\?|$)/);
    const ext = extMatch?.[1] ?? "";
    const videoExts = ["mp4", "mov", "webm", "avi", "mkv"];
    const unsupportedImageExts = ["heic", "heif", "gif", "bmp", "tiff", "tif"];
    if (videoExts.includes(ext)) {
      return NextResponse.json(
        {
          error: `Video generation requires an image source, but the source URL ends in .${ext} (video). Select a JPEG, PNG, or WebP image.`,
        },
        { status: 400 },
      );
    }
    if (unsupportedImageExts.includes(ext)) {
      return NextResponse.json(
        {
          error: `Source image format .${ext} is not supported by the video provider. Re-upload as JPEG, PNG, or WebP.`,
        },
        { status: 400 },
      );
    }
  }

  // Resolve reference asset IDs → URLs (multi-image prompts for Seedance).
  // We verify each belongs to the caller to avoid leaking URLs across users,
  // and cap at 9 to match Seedance's reference_image_urls limit.
  let referenceImageUrls: string[] = [];
  if (
    tool === "video" &&
    Array.isArray(referenceAssetIds) &&
    referenceAssetIds.length > 0
  ) {
    const ids = referenceAssetIds
      .filter((id): id is string => typeof id === "string")
      .slice(0, 9);
    if (ids.length > 0) {
      const { data: refs, error: refsError } = await supabase
        .from("assets")
        .select("id, user_id, original_url, asset_type")
        .in("id", ids);
      if (refsError) {
        console.error("[process] Failed to load reference assets:", refsError);
        return NextResponse.json(
          { error: "Failed to load reference assets" },
          { status: 500 },
        );
      }
      const byId = new Map(refs?.map((r) => [r.id, r]) ?? []);
      for (const id of ids) {
        const r = byId.get(id);
        if (!r || r.user_id !== user.id) {
          return NextResponse.json(
            { error: `Reference asset ${id} not accessible` },
            { status: 403 },
          );
        }
        if (r.asset_type && r.asset_type !== "image") {
          return NextResponse.json(
            {
              error: `Reference asset ${id} is a ${r.asset_type}, not an image. Video generation requires image references only.`,
            },
            { status: 400 },
          );
        }
        referenceImageUrls.push(r.original_url);
      }
    }
  }

  // `@imageN` tokens bind to uploaded-image index N (Seedance uses them as
  // reference_image_urls[N-1]; Kling 3.0 rewrites them to @element_imageN).
  // If the user typed a mention pointing past the actually-attached images,
  // reject with a clear 400 instead of silently stripping — otherwise the
  // output would ignore a reference they thought they were using.
  if (tool === "video" && typeof prompt === "string") {
    const totalImages = 1 + referenceImageUrls.length;
    const mentionRegex = /@image(\d+)/gi;
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(prompt)) !== null) {
      const n = Number.parseInt(match[1], 10);
      if (!Number.isFinite(n) || n < 1 || n > totalImages) {
        return NextResponse.json(
          {
            error: `Prompt references @image${n} but only ${totalImages} image(s) were attached`,
          },
          { status: 400 },
        );
      }
    }
  }

  // Snapshot the generation config so it survives beyond the trigger run — this
  // powers the "view prompt / re-run" flow on past assets.
  const generationConfig: Record<string, unknown> =
    tool === "video"
      ? {
          prompt: prompt ?? null,
          duration: duration ?? null,
          aspectRatio: aspectRatio ?? null,
          quality: quality ?? null,
          voiceoverText: voiceoverText ?? null,
          musicPrompt: musicPrompt ?? null,
          musicVolume: musicVolume ?? null,
          videoModel: resolvedVideoModel ?? null,
          referenceAssetIds:
            referenceImageUrls.length > 0
              ? (referenceAssetIds ?? []).slice(0, 9)
              : null,
          effectId: resolvedEffectId ?? null,
          effectPhrases: resolvedEffectPhrases ?? null,
        }
      : tool === "enhance"
        ? { prompt: prompt ?? null }
        : {};

  // Create a new placeholder asset immediately so it shows in the UI
  const resultAssetType = tool === "video" ? "video" : "image";
  const { data: placeholderAsset, error: insertError } = await supabase
    .from("assets")
    .insert({
      project_id: asset.project_id,
      user_id: user.id,
      original_url: asset.original_url, // temporarily use source image
      asset_type: resultAssetType,
      status: "processing",
      tool_used: tool as Tool,
      thumbnail_url: asset.original_url, // use source image as thumbnail
      source_asset_id: asset.id,
      metadata: generationConfig,
    })
    .select()
    .single();

  if (insertError || !placeholderAsset) {
    console.error("[process] Failed to create placeholder asset:", insertError);
    return NextResponse.json(
      { error: "Failed to start processing" },
      { status: 500 }
    );
  }

  // Dispatch Trigger.dev task with the placeholder asset ID
  try {
    if (tool === "enhance") {
      await tasks.trigger<typeof enhanceImageTask>("enhance-image", {
        assetId: placeholderAsset.id,
        originalUrl: asset.original_url,
        userId: user.id,
      });
    }
    // staging / sky dispatch is handled elsewhere or queued for follow-up —
    // left as a no-op here to keep parity with the original switch surface.
  } catch (err) {
    console.error("[process] Failed to trigger task:", err);
    // Delete the placeholder on trigger failure
    await supabase.from("assets").delete().eq("id", placeholderAsset.id);
    return NextResponse.json(
      { error: "Failed to dispatch processing task" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, resultAssetId: placeholderAsset.id });
}
