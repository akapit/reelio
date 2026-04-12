import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { enhanceImageTask } from "../../../../trigger/enhance-image";
import type { generateVideoTask } from "../../../../trigger/generate-video";

type Tool = "enhance" | "staging" | "sky" | "video";

const VALID_TOOLS: Tool[] = ["enhance", "staging", "sky", "video"];

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

  const { assetId, tool, prompt, duration, aspectRatio, quality } = body as {
    assetId?: string;
    tool?: string;
    prompt?: string;
    duration?: number;
    aspectRatio?: string;
    quality?: string;
  };

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
    .select("id, user_id, project_id, status, original_url")
    .eq("id", assetId)
    .single();

  if (fetchError || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (asset.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
    } else if (tool === "video") {
      await tasks.trigger<typeof generateVideoTask>("generate-video", {
        assetId: placeholderAsset.id,
        originalUrl: asset.original_url,
        userId: user.id,
        prompt,
        duration,
        aspectRatio,
        quality,
      });
    }
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
