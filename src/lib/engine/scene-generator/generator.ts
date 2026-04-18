import pLimit from "p-limit";
import path from "node:path";
import { tmpdir } from "node:os";

import { piapiProvider } from "@/lib/media/providers/piapi";
import { kieaiProvider } from "@/lib/media/providers/kieai";
import type { IMediaProvider, VideoGenerationOptions } from "@/lib/media/types";
import type {
  ImageMetadata,
  Scene,
  ScenePrompt,
  SceneVideo,
} from "@/lib/engine/models";
import { computeCropRect, applyCrop } from "@/lib/engine/vision/smartCrop";

/**
 * Logical name of the video-generation backend. Both providers expose
 * `generateVideo(VideoGenerationOptions) → MediaJobResult`, so they are
 * drop-in compatible for the scene-generator's needs.
 */
export type VideoProviderName = "piapi" | "kieai";

const PROVIDER_REGISTRY: Record<VideoProviderName, IMediaProvider> = {
  piapi: piapiProvider,
  kieai: kieaiProvider,
};

/**
 * Resolve a provider by name. Env fallback:
 *   ENGINE_VIDEO_PROVIDER=kieai  →  kieai (else piapi)
 * Explicit `name` always wins.
 */
export function resolveVideoProvider(
  name?: VideoProviderName,
): IMediaProvider {
  const resolved =
    name ??
    (process.env.ENGINE_VIDEO_PROVIDER as VideoProviderName | undefined) ??
    "piapi";
  const provider = PROVIDER_REGISTRY[resolved];
  if (!provider) {
    throw new Error(
      `resolveVideoProvider: unknown provider "${resolved}". Expected one of: ${Object.keys(PROVIDER_REGISTRY).join(", ")}.`,
    );
  }
  return provider;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GenerateScenesInput {
  scenes: Scene[];
  prompts: ScenePrompt[];
  aspectRatio: "16:9" | "9:16" | "1:1";
  onSceneStart?: (scene: Scene, prompt: ScenePrompt) => Promise<void> | void;
  onSceneTaskId?: (scene: Scene, piapiTaskId: string) => Promise<void> | void;
  onSceneDone?: (scene: Scene, video: SceneVideo) => Promise<void> | void;
  onSceneFailed?: (scene: Scene, error: Error) => Promise<void> | void;
  /** Parallelism cap. Defaults to 3 to avoid piapi rate limits. */
  concurrency?: number;
  /**
   * Logical provider name. Default resolved from `ENGINE_VIDEO_PROVIDER` env
   * or `"piapi"`. Ignored when `provider` is explicitly supplied (test path).
   */
  videoProvider?: VideoProviderName;
  /**
   * Source-image metadata keyed by `Scene.imagePath`. When supplied AND the
   * scene's source image is a local filesystem path, the generator runs
   * `smartCrop` to pre-crop each image to the target aspect ratio using
   * Google Vision's localized-object bboxes. Without this map (or for http(s)
   * paths), smart-crop is skipped and the raw image is forwarded unchanged.
   */
  imagesByPath?: Map<string, ImageMetadata>;
  /**
   * Where cropped images are written. Defaults to `os.tmpdir()/engine-crop`.
   * When `ENGINE_CACHE_DIR` is set, cropped images land there (cache-friendly).
   */
  cropScratchDir?: string;
  /** Optional provider override for tests. Bypasses `videoProvider`. */
  provider?: {
    generateVideo: (
      opts: VideoGenerationOptions & {
        onTaskId?: (id: string) => void;
      },
    ) => Promise<{ outputUrl: string; durationMs?: number; modelUsed?: string }>;
  };
}

export interface GenerateScenesResult {
  /** Successful videos sorted by scene.order ascending. */
  videos: SceneVideo[];
  /** Scenes that failed — absent from `videos`. */
  failed: Array<{ sceneId: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------

const KLING_MAX_DURATION = 10;
const SEEDANCE_MIN_DURATION = 4;
const SEEDANCE_MAX_DURATION = 15;
const GLOBAL_MIN_DURATION = 5; // piapi i2v floor

function clampDuration(
  rawSec: number,
  model: ScenePrompt["modelChoice"],
): number {
  const rounded = Math.max(GLOBAL_MIN_DURATION, Math.round(rawSec));
  if (model === "kling") {
    return Math.min(KLING_MAX_DURATION, rounded);
  }
  // seedance / seedance-fast
  return Math.min(SEEDANCE_MAX_DURATION, Math.max(SEEDANCE_MIN_DURATION, rounded));
}

// ---------------------------------------------------------------------------
// Structured logger
// ---------------------------------------------------------------------------

function log(
  event: string,
  sceneId: string,
  data: Record<string, unknown> = {},
): void {
  try {
    console.log(
      JSON.stringify({ source: "engine.sceneGenerator", event, sceneId, ...data }),
    );
  } catch {
    console.log(`[engine.sceneGenerator] ${event} sceneId=${sceneId}`);
  }
}

// ---------------------------------------------------------------------------
// Smart-crop preprocessing
// ---------------------------------------------------------------------------

const ASPECT_AR: Record<GenerateScenesInput["aspectRatio"], number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
};

function isHttpUrl(p: string): boolean {
  return /^https?:\/\//i.test(p);
}

function resolveCropScratchDir(input: GenerateScenesInput): string {
  if (input.cropScratchDir) return input.cropScratchDir;
  const cacheDir = process.env.ENGINE_CACHE_DIR;
  if (cacheDir) return path.join(cacheDir, "crops");
  return path.join(tmpdir(), "engine-crop");
}

/**
 * Run smart-crop on the source image if we have the metadata AND the source
 * is a local path. Returns either the cropped path or the original input.
 * Never throws — any failure is logged and the original path is used.
 */
async function maybeSmartCrop(
  scene: Scene,
  aspectRatio: GenerateScenesInput["aspectRatio"],
  input: GenerateScenesInput,
): Promise<string> {
  const meta = input.imagesByPath?.get(scene.imagePath);
  if (!meta) {
    return scene.imagePath;
  }
  if (isHttpUrl(scene.imagePath)) {
    // smartCrop needs a local file for ffmpeg; URLs get passed through.
    // TODO: fetch-then-crop-then-upload would allow smart-crop on R2 URLs too.
    return scene.imagePath;
  }
  try {
    const rect = computeCropRect(meta.dims, meta.visionObjects, ASPECT_AR[aspectRatio]);
    log("smartCrop.rect", scene.sceneId, {
      reason: rect.reason,
      noop: rect.noop,
      sourceDims: meta.dims,
      rect: rect.noop ? undefined : { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      targetAR: aspectRatio,
      objectCount: meta.visionObjects.length,
    });
    if (rect.noop) return scene.imagePath;
    const scratchDir = resolveCropScratchDir(input);
    return await applyCrop(scene.imagePath, rect, scratchDir);
  } catch (err) {
    log("smartCrop.failed", scene.sceneId, {
      error: err instanceof Error ? err.message : String(err),
    });
    return scene.imagePath;
  }
}

// ---------------------------------------------------------------------------
// Per-scene generation
// ---------------------------------------------------------------------------

async function generateOneScene(
  scene: Scene,
  prompt: ScenePrompt,
  aspectRatio: GenerateScenesInput["aspectRatio"],
  input: GenerateScenesInput,
): Promise<SceneVideo> {
  const wallStart = Date.now();
  const provider = input.provider ?? resolveVideoProvider(input.videoProvider);
  const providerName =
    input.provider !== undefined
      ? "test-override"
      : (input.videoProvider ??
          (process.env.ENGINE_VIDEO_PROVIDER as VideoProviderName | undefined) ??
          "piapi");

  log("scene.start", scene.sceneId, {
    model: prompt.modelChoice,
    provider: providerName,
    order: scene.order,
    imagePath: scene.imagePath,
  });
  await input.onSceneStart?.(scene, prompt);

  // --- Smart crop preprocessing (best-effort; never fails the scene) ---
  const croppedPath = await maybeSmartCrop(scene, aspectRatio, input);

  const duration = clampDuration(scene.durationSec, prompt.modelChoice);

  const opts: VideoGenerationOptions & { onTaskId?: (id: string) => void } = {
    imageUrl: croppedPath,
    prompt: prompt.prompt,
    model: prompt.modelChoice,
    duration,
    aspectRatio,
    onTaskId: async (piapiTaskId: string) => {
      log("scene.taskId", scene.sceneId, { piapiTaskId, model: prompt.modelChoice });
      await input.onSceneTaskId?.(scene, piapiTaskId);
    },
  };

  // Pass Kling mode param when explicitly set.
  if (prompt.modelChoice === "kling" && prompt.modelParams?.mode) {
    // VideoGenerationOptions does not expose `mode` directly — it is an
    // internal piapi field. Cast through unknown to keep the provider
    // contract intact while forwarding the caller's intent. The piapi
    // provider reads `options.mode` off the options bag if present.
    (opts as Record<string, unknown>)["mode"] = prompt.modelParams.mode;
  }

  const result = await provider.generateVideo(opts);
  const generationMs = Date.now() - wallStart;

  if (!result.outputUrl) {
    throw new Error(
      `piapi returned empty outputUrl for scene ${scene.sceneId} (model=${prompt.modelChoice})`,
    );
  }

  // Derive model string from result — the provider fills this in.
  const model =
    "model" in result && typeof result.model === "string"
      ? result.model
      : prompt.modelChoice;

  // Extract the piapi task ID from the result if available.
  const piapiTaskId =
    "externalIds" in result &&
    result.externalIds != null &&
    typeof result.externalIds === "object" &&
    "taskId" in result.externalIds &&
    typeof result.externalIds.taskId === "string"
      ? result.externalIds.taskId
      : undefined;

  const video: SceneVideo = {
    sceneId: scene.sceneId,
    videoUrl: result.outputUrl,
    model,
    generationMs,
    ...(piapiTaskId !== undefined ? { piapiTaskId } : {}),
    // piapi does not return the actual clip length; caller can derive from
    // the clamped duration we requested.
    durationSec: duration,
  };

  log("scene.done", scene.sceneId, {
    piapiTaskId,
    model,
    durationSec: duration,
    generationMs,
  });
  await input.onSceneDone?.(scene, video);

  return video;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function generateScenes(
  input: GenerateScenesInput,
): Promise<GenerateScenesResult> {
  const { scenes, prompts, aspectRatio, concurrency = 3 } = input;

  // Build a fast lookup: sceneId → ScenePrompt
  const promptMap = new Map<string, ScenePrompt>(
    prompts.map((p) => [p.sceneId, p]),
  );

  const limit = pLimit(concurrency);
  const videos: SceneVideo[] = [];
  const failed: Array<{ sceneId: string; error: string }> = [];

  await Promise.all(
    scenes.map((scene) =>
      limit(async () => {
        const prompt = promptMap.get(scene.sceneId);
        if (!prompt) {
          const err = new Error(
            `No ScenePrompt found for sceneId=${scene.sceneId}`,
          );
          log("scene.failed", scene.sceneId, { error: err.message });
          failed.push({ sceneId: scene.sceneId, error: err.message });
          await input.onSceneFailed?.(scene, err);
          return;
        }

        try {
          const video = await generateOneScene(scene, prompt, aspectRatio, input);
          videos.push(video);
        } catch (raw) {
          const err = raw instanceof Error ? raw : new Error(String(raw));
          log("scene.failed", scene.sceneId, {
            error: err.message,
            model: prompt.modelChoice,
          });
          failed.push({ sceneId: scene.sceneId, error: err.message });
          await input.onSceneFailed?.(scene, err);
        }
      }),
    ),
  );

  // Sort by scene.order ascending.
  const sceneOrderMap = new Map<string, number>(
    scenes.map((s) => [s.sceneId, s.order]),
  );
  videos.sort(
    (a, b) =>
      (sceneOrderMap.get(a.sceneId) ?? 0) - (sceneOrderMap.get(b.sceneId) ?? 0),
  );

  return { videos, failed };
}
