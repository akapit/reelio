import { NextRequest, NextResponse } from "next/server";
import { createClient, getUserSafe } from "@/lib/supabase/server";
import { cleanMentionTokens } from "@/lib/media/prompts/seedance";
import {
  KLING_MAX_SHOTS,
  distributeKlingShots,
} from "@/lib/media/prompts/kling";
import { callCodex } from "@/lib/llm/codex";

// LLM goes through the shared `callCodex` client (src/lib/llm/codex.ts).
// The underlying proxy does NOT accept multimodal `input_image` content
// blocks — sending them returns a non-200, surfacing as a 502 here. We
// send text-only input (same pattern as generate-script and seedance.ts);
// the system prompt encodes image count, duration, and target model.
const VISION_MODEL = "gpt-5-4";
const LLM_TIMEOUT_MS = 20_000;
const MAX_IMAGES = 9;

function log(event: string, data: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ source: "generate-video-prompt", event, ...data }));
  } catch {
    console.log(`[generate-video-prompt] ${event}`);
  }
}

function logError(event: string, data: Record<string, unknown>): void {
  try {
    console.error(JSON.stringify({ source: "generate-video-prompt", event, level: "error", ...data }));
  } catch {
    console.error(`[generate-video-prompt] ${event} (error)`);
  }
}

function buildSystemPrompt(
  videoModel: "kling" | "seedance" | "seedance-fast" | "seedance-1-fast",
  imageCount: number,
  totalDuration: number,
): string {
  if (videoModel === "kling") {
    // Kling auto-fans one clip PER attached image and concatenates via ffmpeg.
    // The user picks the TOTAL video length; the trigger distributes that
    // across N shots as a mix of 5s and 10s slots. Describe this honestly so
    // the LLM writes a prompt that reads well across varying shot lengths.
    const n = Math.min(Math.max(imageCount, 1), KLING_MAX_SHOTS);
    const shotDurations = distributeKlingShots(totalDuration, n);
    const effectiveTotal =
      shotDurations.reduce((s, d) => s + d, 0) || totalDuration;
    const breakdown =
      shotDurations.length > 0
        ? shotDurations.map((d) => `${d}s`).join(" + ")
        : `${effectiveTotal}s`;
    return (
      `You generate a single cinematic real-estate video prompt for Kling. ` +
      `The same prompt is applied to ${n} shot(s) — one per attached image — ` +
      `running ${breakdown} (concatenated into a ${effectiveTotal}s video). ` +
      `Write ONE short paragraph (≤400 characters) describing the camera motion, mood, lighting, and atmosphere that should flow across all the attached photos. ` +
      `Prefer motivated moves — slow dolly, gentle push-in, subtle orbit — over fast cuts, since shot lengths vary. ` +
      `Do NOT use "---" separators. Do NOT use @imageN tokens — the images are already bound positionally to shots. ` +
      `Output ONLY the prompt — no quotes, no preamble, no explanation.`
    );
  }

  // Seedance-family models: single clip at `totalDuration`. Rich prose,
  // @imageN tokens inline for per-image roles.
  const wordsGuide = totalDuration >= 10 ? "50–60 words" : "25–35 words";
  const imageRoleNote = imageCount === 1
    ? ` Reference the image with @image1 to assign its role (e.g. "@image1 as the hero subject").`
    : ` Reference images by index: @image1 as the hero subject` +
      (imageCount >= 2 ? `, @image2 for lighting mood or palette` : "") +
      (imageCount >= 3 ? `, @image3..@image${Math.min(imageCount, MAX_IMAGES)} for additional context` : "") +
      `. Use each @imageN token exactly — they are reference anchors the model relies on.`;

  return (
    `You generate rich scene-description prompts for the ByteDance ${videoModel === "seedance-1-fast" ? "Seedance 1.0 Pro Fast" : "Seedance 2.0"} video model. ` +
    `Write ONE paragraph of ${wordsGuide} describing the scene for a ${totalDuration}-second real estate clip. ` +
    `Include subjects, setting, motion, lighting, and atmosphere — not just cinematography commands. ` +
    imageRoleNote +
    ` Do NOT use "---" separators. Do NOT use @image tokens for images that are not provided. ` +
    `Output ONLY the prompt — no quotes, no preamble, no explanation.`
  );
}

/** Build the user turn text. kie.ai's codex proxy rejects multimodal input blocks, so
 * we describe the images in prose instead of attaching them. The system prompt already
 * carries the model-specific grammar rules and output constraints. */
function buildUserInput(
  imageCount: number,
  videoModel: string,
  totalDuration: number,
): string {
  const images = `${imageCount} real estate image${imageCount === 1 ? "" : "s"}`;
  return `Generate a ${videoModel} video prompt for ${images}. Total duration: ${totalDuration}s.`;
}

/** Trim to max 5 shots for Kling by slicing on `---` separators. */
function trimKlingShots(raw: string): string {
  const sep = /^\s*---\s*$/m;
  const parts = raw.split(sep).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= KLING_MAX_SHOTS) return raw.trim();
  return parts.slice(0, KLING_MAX_SHOTS).join("\n---\n");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await getUserSafe(supabase);
  if (auth.kind === "fetchFailed") {
    logError("auth.fetchFailed", { error: String(auth.error) });
    return NextResponse.json(
      {
        error:
          "Couldn't verify your session — auth service unreachable. Please try again.",
        code: "auth_fetch_failed",
      },
      { status: 503 },
    );
  }
  if (auth.kind === "unauthenticated") {
    log("auth.unauthorized", {});
    return NextResponse.json(
      { error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }
  const user = auth.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { videoModel, imageAssetIds, duration } = body as {
    videoModel?: string;
    imageAssetIds?: unknown;
    duration?: unknown;
  };

  const VALID_MODELS = [
    "kling",
    "seedance",
    "seedance-fast",
    "seedance-1-fast",
  ] as const;
  if (!videoModel || !(VALID_MODELS as readonly string[]).includes(videoModel)) {
    return NextResponse.json(
      {
        error:
          "videoModel must be one of: kling, seedance, seedance-fast, seedance-1-fast",
      },
      { status: 400 },
    );
  }
  const resolvedModel = videoModel as (typeof VALID_MODELS)[number];

  if (!Array.isArray(imageAssetIds) || imageAssetIds.length === 0) {
    return NextResponse.json(
      { error: "attach at least one image before auto-generating" },
      { status: 400 },
    );
  }

  // Client sends the TOTAL video duration (seconds). Accept any sane integer;
  // defensively clamp to [4, 80] — covers Seedance's native [4, 15] and
  // Kling's [5×1, 10×8] auto-fan range.
  const rawDuration =
    typeof duration === "number" && Number.isFinite(duration)
      ? Math.round(duration)
      : 5;
  const resolvedDuration = Math.max(4, Math.min(80, rawDuration));

  // Load and authorize assets — cap at MAX_IMAGES, verify ownership.
  const ids = (imageAssetIds as unknown[])
    .filter((id): id is string => typeof id === "string")
    .slice(0, MAX_IMAGES);

  // Still fetch assets (ownership check) even though we no longer ship the URLs
  // to kie.ai — this blocks prompt-generation for assets the caller can't see.
  const { data: assets, error: fetchError } = await supabase
    .from("assets")
    .select("id, user_id")
    .in("id", ids);

  if (fetchError) {
    logError("assets.fetch", { error: String(fetchError) });
    return NextResponse.json({ error: "Failed to load assets" }, { status: 500 });
  }

  const byId = new Map((assets ?? []).map((a) => [a.id, a]));
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) {
      return NextResponse.json({ error: `Asset ${id} not found` }, { status: 404 });
    }
    if (a.user_id !== user.id) {
      return NextResponse.json({ error: `Asset ${id} not accessible` }, { status: 403 });
    }
  }

  const imageCount = ids.length;

  log("request", { userId: user.id, videoModel: resolvedModel, imageCount, duration: resolvedDuration });

  const systemPrompt = buildSystemPrompt(resolvedModel, imageCount, resolvedDuration);
  const userInput = buildUserInput(imageCount, resolvedModel, resolvedDuration);

  let raw: string | null = null;
  try {
    const result = await callCodex({
      model: VISION_MODEL,
      system: systemPrompt,
      prompt: userInput,
      timeoutMs: LLM_TIMEOUT_MS,
    });
    log("llm.response", { durationMs: result.durationMs });
    raw = result.text.trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message === "codex timeout";
    // `callCodex` throws "codex: no text in response" when the response
    // body has no parseable text — preserve the pre-refactor `llm.noText`
    // event + 502 response shape for that case. HTTP errors throw
    // messages starting with `"codex <status>:"` which map to `llm.error`.
    if (message.includes("no text in response")) {
      logError("llm.noText", { model: VISION_MODEL });
      return NextResponse.json({ error: "No text in response" }, { status: 502 });
    }
    if (isTimeout) {
      logError("llm.fetch", { error: message, timeout: true });
      return NextResponse.json(
        { error: "AI generation timed out" },
        { status: 502 },
      );
    }
    if (message.startsWith("codex ")) {
      logError("llm.error", { error: message });
      return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
    }
    logError("llm.fetch", { error: message, timeout: false });
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 502 },
    );
  }

  if (!raw) {
    logError("llm.noText", { model: VISION_MODEL });
    return NextResponse.json({ error: "No text in response" }, { status: 502 });
  }

  // Post-process: strip out-of-range @imageN tokens (LLM hallucinations).
  let prompt = cleanMentionTokens(raw, imageCount);

  // For Kling: additionally cap to KLING_MAX_SHOTS shots.
  if (resolvedModel === "kling") {
    prompt = trimKlingShots(prompt);
  }

  log("prompt.generated", { videoModel: resolvedModel, imageCount, promptLength: prompt.length });

  return NextResponse.json({ prompt });
}
