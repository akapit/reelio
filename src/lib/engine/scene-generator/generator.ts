import pLimit from "p-limit";

import { piapiProvider } from "@/lib/media/providers/piapi";
import {
  kieaiProvider,
  DEFAULT_KLING_RETRY_CFG_SCALE,
  composeKlingRetryNegativePrompt,
} from "@/lib/media/providers/kieai";
import type { IMediaProvider, VideoGenerationOptions } from "@/lib/media/types";
import { evaluateSceneVideo } from "@/lib/engine/scene-evaluator/evaluator";
import { prepareSceneSource } from "@/lib/engine/scene-generator/source-prep";
import type {
  ImageMetadata,
  PreparedSceneSource,
  Scene,
  ScenePrompt,
  SceneQualityEvaluation,
  SceneVideo,
} from "@/lib/engine/models";

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
 *   ENGINE_VIDEO_PROVIDER=piapi  →  piapi (else kieai)
 * Explicit `name` always wins. kie.ai is the default because its plan
 * allows ~100+ concurrent tasks (20 requests/10s) vs piapi's 2-task cap.
 */
export function resolveVideoProvider(
  name?: VideoProviderName,
): IMediaProvider {
  const resolved =
    name ??
    (process.env.ENGINE_VIDEO_PROVIDER as VideoProviderName | undefined) ??
    "kieai";
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
  onSceneStart?: (
    scene: Scene,
    context: SceneAttemptContext,
  ) => Promise<void> | void;
  onSceneTaskId?: (
    scene: Scene,
    piapiTaskId: string,
    context: SceneAttemptContext,
  ) => Promise<void> | void;
  onSceneDone?: (
    scene: Scene,
    video: SceneVideo,
    context: SceneAttemptContext,
  ) => Promise<void> | void;
  onSceneFailed?: (
    scene: Scene,
    error: Error,
    context: SceneAttemptContext,
  ) => Promise<void> | void;
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
   * Where downloaded/cropped sources are written. Defaults to `ENGINE_CACHE_DIR`
   * or an OS temp directory.
   */
  cropScratchDir?: string;
  /** Prefix used when uploading prepared sources back to R2. */
  preparedAssetPrefix?: string;
  /** Default 2. Retry a scene once when generation fails or QA rejects it. */
  maxAttempts?: number;
  /** Disable the post-generation QA pass. Default true. */
  evaluateScenes?: boolean;
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

export interface SceneAttemptContext {
  attempt: number;
  maxAttempts: number;
  prompt: ScenePrompt;
  preparedSource: PreparedSceneSource;
  providerName: string;
  evaluation?: SceneQualityEvaluation;
  willRetry?: boolean;
  retryReason?: string | null;
}

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------

// Kling 2.5 Turbo Pro accepts ONLY the discrete values 5 and 10 — any integer
// in between (6, 7, 8, 9) returns a kie.ai 500 "duration is not within the
// range of allowed options" error. Product decision: always pick 5s for Kling
// regardless of the planner's requested duration. Rationale: luxury_30s slot
// durations are all 3-6s, so 5s covers them naturally; jumping to 10s would
// double the cost and nearly always overshoot what the planner asked for.
const KLING_FIXED_DURATION = 5 as const;
const SEEDANCE_MIN_DURATION = 4;
const SEEDANCE_MAX_DURATION = 15;
const GLOBAL_MIN_DURATION = 5; // piapi i2v floor

function clampDuration(
  rawSec: number,
  model: ScenePrompt["modelChoice"],
): number {
  if (model === "kling") {
    // Kling: always 5s. See KLING_FIXED_DURATION note above.
    return KLING_FIXED_DURATION;
  }
  // seedance / seedance-fast
  const rounded = Math.max(GLOBAL_MIN_DURATION, Math.round(rawSec));
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

function buildRetryPrompt(prompt: ScenePrompt, feedback?: string | null): ScenePrompt {
  const stabilityNudge =
    "Keep the motion subtle, smooth, and geometrically stable. Avoid warping, flicker, and exaggerated zoom.";
  const retryPrompt = feedback?.trim()
    ? feedback.trim()
    : prompt.prompt.includes(stabilityNudge)
      ? prompt.prompt
      : `${prompt.prompt} ${stabilityNudge}`;

  return {
    ...prompt,
    prompt: retryPrompt,
    modelChoice:
      prompt.modelChoice === "seedance-fast" ? "seedance" : prompt.modelChoice,
    modelReason: prompt.modelReason
      ? `${prompt.modelReason} Retry tuned for higher stability.`
      : "retry tuned for higher stability",
  };
}

/**
 * Minimum evaluator score for a scene to pass without retry. Even when the
 * evaluator flags the scene as `passed: true`, a score below this threshold
 * triggers a retry with tightened Kling knobs — catches "barely passing but
 * still weird" outputs that binary pass/fail would miss. Overridable via
 * ENGINE_SCENE_SCORE_FLOOR.
 */
const DEFAULT_SCENE_SCORE_FLOOR = 0.65;

function sceneScoreFloor(): number {
  const raw = process.env.ENGINE_SCENE_SCORE_FLOOR;
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_SCENE_SCORE_FLOOR;
  return Math.max(0, Math.min(1, parsed));
}

function klingRetryCfgScale(): number {
  const raw = process.env.ENGINE_KLING_RETRY_CFG_SCALE;
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_KLING_RETRY_CFG_SCALE;
  return Math.max(0, Math.min(1, parsed));
}

// ---------------------------------------------------------------------------
// Per-scene generation
// ---------------------------------------------------------------------------

async function generateOneScene(
  scene: Scene,
  initialPrompt: ScenePrompt,
  aspectRatio: GenerateScenesInput["aspectRatio"],
  input: GenerateScenesInput,
): Promise<SceneVideo> {
  const provider = input.provider ?? resolveVideoProvider(input.videoProvider);
  const providerName =
    input.provider !== undefined
      ? "test-override"
      : (input.videoProvider ??
          (process.env.ENGINE_VIDEO_PROVIDER as VideoProviderName | undefined) ??
          "kieai");

  const preparedSource = await prepareSceneSource({
    scene,
    aspectRatio,
    imagesByPath: input.imagesByPath,
    scratchDir: input.cropScratchDir,
    uploadPrefix: input.preparedAssetPrefix,
  });
  const maxAttempts = Math.max(1, input.maxAttempts ?? 2);
  let prompt = initialPrompt;
  let lastError: Error | null = null;
  // Kling-specific anti-artifact knobs carried across attempts. First attempt
  // lets the provider use its defaults (negative_prompt + cfg_scale=0.6).
  // After a rejection/failure, we tighten cfg and augment the negative prompt
  // with the evaluator's specific issues (when available).
  let klingCfgOverride: number | undefined;
  let klingNegativeOverride: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const wallStart = Date.now();
    const attemptContext: SceneAttemptContext = {
      attempt,
      maxAttempts,
      prompt,
      preparedSource,
      providerName,
    };

    log("scene.start", scene.sceneId, {
      model: prompt.modelChoice,
      provider: providerName,
      order: scene.order,
      imagePath: scene.imagePath,
      preparedImageUrl: preparedSource.providerImageUrl,
      attempt,
      klingCfgOverride,
      klingNegativeOverrideLen: klingNegativeOverride?.length,
    });
    await input.onSceneStart?.(scene, attemptContext);

    const duration = clampDuration(scene.durationSec, prompt.modelChoice);
    const opts: VideoGenerationOptions & { onTaskId?: (id: string) => void } = {
      imageUrl: preparedSource.providerImageUrl,
      prompt: prompt.prompt,
      model: prompt.modelChoice,
      duration,
      aspectRatio,
      onTaskId: async (piapiTaskId: string) => {
        log("scene.taskId", scene.sceneId, {
          piapiTaskId,
          model: prompt.modelChoice,
          attempt,
        });
        await input.onSceneTaskId?.(scene, piapiTaskId, attemptContext);
      },
    };

    if (prompt.modelChoice === "kling") {
      if (prompt.modelParams?.mode) {
        (opts as Record<string, unknown>)["mode"] = prompt.modelParams.mode;
      }
      if (klingCfgOverride !== undefined) opts.cfgScale = klingCfgOverride;
      if (klingNegativeOverride !== undefined) {
        opts.negativePrompt = klingNegativeOverride;
      }
    }

    try {
      const result = await provider.generateVideo(opts);
      const generationMs = Date.now() - wallStart;

      if (!result.outputUrl) {
        throw new Error(
          `provider returned empty outputUrl for scene ${scene.sceneId} (model=${prompt.modelChoice})`,
        );
      }

      const model =
        "model" in result && typeof result.model === "string"
          ? result.model
          : prompt.modelChoice;

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
        attemptOrder: attempt,
        prompt,
        preparedSource,
        ...(piapiTaskId !== undefined ? { piapiTaskId } : {}),
        durationSec: duration,
      };

      if (input.evaluateScenes !== false) {
        const evaluation = await evaluateSceneVideo({
          scene,
          prompt,
          video,
          preparedSource,
        });
        video.evaluation = evaluation;
        attemptContext.evaluation = evaluation;

        // Phase B1: retry not only on explicit fail but also when the score
        // is below a configurable floor. This catches "barely passed but
        // still weird" outputs that binary pass/fail would wave through.
        const floor = sceneScoreFloor();
        const scoreBelowFloor =
          typeof evaluation.score === "number" && evaluation.score < floor;
        const shouldRetry =
          (!evaluation.passed || scoreBelowFloor) && attempt < maxAttempts;

        if (shouldRetry) {
          const retryPrompt = buildRetryPrompt(prompt, evaluation.retryPrompt);
          const retryError = new Error(
            evaluation.passed
              ? `scene quality below floor (${evaluation.score}<${floor}): ${evaluation.summary}`
              : `scene quality rejected: ${evaluation.summary}`,
          );
          // Tighten Kling knobs for the next attempt — only relevant when the
          // NEXT prompt's model is still Kling. buildRetryPrompt can
          // downgrade seedance-fast→seedance but never touches Kling.
          if (retryPrompt.modelChoice === "kling") {
            klingCfgOverride = klingRetryCfgScale();
            klingNegativeOverride = composeKlingRetryNegativePrompt(
              evaluation.issues ?? [],
            );
          }
          attemptContext.willRetry = true;
          attemptContext.retryReason =
            evaluation.retryReason ??
            (evaluation.passed
              ? `score_below_floor_${floor}`
              : evaluation.summary);
          await input.onSceneFailed?.(scene, retryError, attemptContext);
          prompt = retryPrompt;
          lastError = retryError;
          continue;
        }
      }

      log("scene.done", scene.sceneId, {
        piapiTaskId,
        model,
        durationSec: duration,
        generationMs,
        attempt,
        evaluationPassed: video.evaluation?.passed,
        evaluationScore: video.evaluation?.score,
      });
      await input.onSceneDone?.(scene, video, attemptContext);
      return video;
    } catch (raw) {
      const err = raw instanceof Error ? raw : new Error(String(raw));
      const willRetry = attempt < maxAttempts;
      attemptContext.willRetry = willRetry;
      attemptContext.retryReason = willRetry ? "provider failure retry" : null;
      await input.onSceneFailed?.(scene, err, attemptContext);
      lastError = err;
      if (!willRetry) {
        throw err;
      }
      prompt = buildRetryPrompt(prompt, null);
      // Provider failure gives us no evaluator issues to feed back; fall back
      // to the baseline negative prompt (undefined → provider default) plus
      // the tighter retry cfg_scale. Keep this in sync with the evaluator
      // branch above so retry behaviour is consistent across failure modes.
      if (prompt.modelChoice === "kling") {
        klingCfgOverride = klingRetryCfgScale();
        klingNegativeOverride = composeKlingRetryNegativePrompt([]);
      }
    }
  }

  throw lastError ?? new Error(`scene generation failed for ${scene.sceneId}`);
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
          await input.onSceneFailed?.(scene, err, {
            attempt: 1,
            maxAttempts: Math.max(1, input.maxAttempts ?? 2),
            prompt: {
              sceneId: scene.sceneId,
              prompt: "",
              modelChoice: "kling",
            },
            preparedSource: {
              originalImagePath: scene.imagePath,
              providerImageUrl: scene.imagePath,
              localizedFromRemote: false,
              crop: null,
              sourceLocalPath: null,
              preparedLocalPath: null,
              uploadedPreparedUrl: null,
            },
            providerName:
              input.videoProvider ??
              (process.env.ENGINE_VIDEO_PROVIDER as VideoProviderName | undefined) ??
              "kieai",
          });
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
          // The per-attempt callback has already been fired inside
          // `generateOneScene`; avoid duplicating attempt rows/events here.
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
