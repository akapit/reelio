/**
 * Engine orchestrator — imperative linear pipeline.
 *
 * Flow:
 *   1. Vision analyze  — Google Cloud Vision produces per-image analysis + ratings
 *   2. Plan            — slot-fill a scene timeline from the template
 *   3. Scene prompts   — Claude writes one cinematography prompt per scene
 *   4. Scene generate  — piapi Kling 2.5 i2v (or Seedance) per scene, in parallel
 *   5. Audio (opt.)    — ElevenLabs voiceover + music
 *   6. Merge           — ffmpeg concat scenes with xfade transitions + audio mux
 *
 * Every step is recorded in Supabase (engine_runs / engine_steps) when
 * `request.tracking` is provided. Without tracking, the pipeline still runs
 * (used by scripts/test-engine.ts and local smoke tests) but writes no rows.
 */

import nodePath from "node:path";

import { analyzeImages } from "../vision/analyzer";
import { loadTemplate } from "../templates/loader";
import { planTimeline } from "../planner/planner";
import { writeScenePrompts } from "../prompt-writer/writer";
import { generateScenes, type VideoProviderName } from "../scene-generator/generator";
import { mergeScenes } from "../merge/ffmpeg";
import {
  generateVoiceover,
  generateBackgroundMusic,
} from "../../audio/elevenlabs";
import {
  startRun,
  startStep,
  finishStep,
  withStep,
  completeRun,
  mergeRunSummary,
} from "../tracking/supabase";
import {
  JobError,
  JobResult,
  ImageDataset,
  SceneTimeline,
  Scene,
  ScenePrompt,
  SceneVideo,
  FailureReason,
  Layer,
} from "../models";

export interface RunEngineTracking {
  assetId: string;
  userId: string;
  projectId?: string | null;
}

export interface RunEngineRequest {
  imagePaths: string[];
  templateName: string;
  outputPath: string;
  /** When set, every step is persisted to Supabase engine_runs/engine_steps. */
  tracking?: RunEngineTracking;
  /** Optional narration. When set, runs ElevenLabs voiceover generation. */
  voiceoverText?: string;
  voiceoverVoiceId?: string;
  /** Optional background music. When set, runs ElevenLabs music generation. */
  musicPrompt?: string;
  /** 0..1 — music loudness in the final mix. Default 0.2. */
  musicVolume?: number;
  /**
   * Video-generation backend. Defaults to piapi (current behaviour); set to
   * "kieai" to route per-scene Kling/Seedance calls through the kie.ai
   * provider instead. Env fallback: `ENGINE_VIDEO_PROVIDER`.
   */
  videoProvider?: VideoProviderName;
}

export interface RunEngineDeps {
  // Reserved for future dep injection. Currently unused — kept for back-compat.
}

function log(event: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(JSON.stringify({ source: "engine.orchestrator", event, ...data }));
  } catch {
    /* never throw from logging */
  }
}

function makeError(
  layer: Layer,
  reason: FailureReason,
  message: string,
  details?: Record<string, unknown>,
): JobError {
  return { status: "error", layer, reason, message, details };
}

/** Convert an ImageDataset into the summary.images base array (pre-generation). */
function datasetToImageSummary(dataset: ImageDataset): Array<Record<string, unknown>> {
  return dataset.images.map((img) => ({
    url: img.path,
    analysis: {
      roomType: img.roomType,
      dims: img.dims,
      dominantColorsHex: img.dominantColorsHex,
      visionLabels: img.visionLabels,
    },
    rating: img.scores,
    eligibility: img.eligibility,
  }));
}

/** Merge per-scene planning/prompt/generation info back onto the summary images. */
function mergeSceneInfoIntoSummary(
  baseImages: Array<Record<string, unknown>>,
  scenes: Scene[],
  prompts: ScenePrompt[],
  videos: SceneVideo[],
): Array<Record<string, unknown>> {
  const promptBySceneId = new Map(prompts.map((p) => [p.sceneId, p]));
  const videoBySceneId = new Map(videos.map((v) => [v.sceneId, v]));
  const imageByUrl = new Map(baseImages.map((img) => [img.url as string, { ...img }]));
  for (const scene of scenes) {
    const img = imageByUrl.get(scene.imagePath);
    if (!img) continue;
    const p = promptBySceneId.get(scene.sceneId);
    const v = videoBySceneId.get(scene.sceneId);
    img.sceneId = scene.sceneId;
    img.sceneOrder = scene.order;
    img.sceneRole = scene.sceneRole;
    img.durationSec = scene.durationSec;
    img.motionIntent = scene.motionIntent;
    if (p) {
      img.scenePrompt = p.prompt;
      img.modelChoice = p.modelChoice;
      img.modelReason = p.modelReason;
    }
    if (v) {
      img.sceneVideoUrl = v.videoUrl;
      img.piapiTaskId = v.piapiTaskId;
    }
  }
  return Array.from(imageByUrl.values());
}

export async function runEngineJob(
  request: RunEngineRequest,
  _deps: RunEngineDeps = {},
): Promise<JobResult | JobError> {
  const startedAt = Date.now();
  const { imagePaths, templateName, outputPath, tracking } = request;

  log("run.start", {
    imageCount: imagePaths.length,
    templateName,
    outputPath,
    tracked: !!tracking,
    videoProvider:
      request.videoProvider ??
      (process.env.ENGINE_VIDEO_PROVIDER as string | undefined) ??
      "piapi",
  });

  // --- Start run (optional tracking) ---
  let runId: string | undefined;
  if (tracking) {
    try {
      runId = await startRun({
        assetId: tracking.assetId,
        userId: tracking.userId,
        projectId: tracking.projectId ?? null,
        input: {
          imagePaths,
          templateName,
          outputPath,
          hasVoiceover: !!request.voiceoverText,
          hasMusic: !!request.musicPrompt,
          musicVolume: request.musicVolume,
        },
      });
    } catch (err) {
      log("run.trackingStartFailed", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal: continue without tracking rather than failing the whole run.
    }
  }

  const failRun = async (err: Record<string, unknown>): Promise<void> => {
    if (!runId) return;
    try {
      await completeRun({ runId, status: "failed", error: err });
    } catch {
      /* already logged */
    }
  };

  // --- Step 1: Vision analyze ---
  let dataset: ImageDataset;
  try {
    dataset = runId
      ? await withStep(
          { runId, stepOrder: 1, stepType: "vision_analyze", input: { imageCount: imagePaths.length } },
          async () => {
            const d = await analyzeImages(imagePaths);
            return {
              output: { images: datasetToImageSummary(d), usableCount: d.usableCount, availableRoomTypes: d.availableRoomTypes },
              metrics: { imageCount: d.images.length },
              result: d,
            };
          },
        )
      : await analyzeImages(imagePaths);
  } catch (err) {
    const jobErr = makeError(
      "vision",
      "vision_api_failure",
      err instanceof Error ? err.message : String(err),
    );
    await failRun(jobErr);
    log("run.visionFailed", { error: jobErr.message });
    return jobErr;
  }

  // --- Step 2: Load template + plan ---
  let template;
  try {
    template = loadTemplate(templateName);
  } catch (err) {
    const jobErr = makeError(
      "planner",
      "no_usable_template",
      err instanceof Error ? err.message : String(err),
    );
    await failRun(jobErr);
    return jobErr;
  }

  if (dataset.usableCount < template.minUsableImages) {
    const jobErr = makeError(
      "planner",
      "insufficient_images",
      `usableCount=${dataset.usableCount} < minUsableImages=${template.minUsableImages}`,
      { usableCount: dataset.usableCount, required: template.minUsableImages },
    );
    await failRun(jobErr);
    return jobErr;
  }

  let timeline: SceneTimeline;
  try {
    const planResult = runId
      ? await withStep(
          { runId, stepOrder: 2, stepType: "plan", input: { templateName } },
          async () => {
            const r = planTimeline({ dataset, template });
            if (r.abortedSlotIds && r.abortedSlotIds.length > 0) {
              return {
                output: { abortedSlotIds: r.abortedSlotIds },
                result: r,
              };
            }
            return {
              output: {
                templateName: r.timeline.templateName,
                sceneCount: r.timeline.scenes.length,
                totalDurationSec: r.timeline.totalDurationSec,
                warnings: r.timeline.warnings,
                unfilledSlotIds: r.timeline.unfilledSlotIds,
              },
              result: r,
            };
          },
        )
      : planTimeline({ dataset, template });

    if (planResult.abortedSlotIds && planResult.abortedSlotIds.length > 0) {
      const jobErr = makeError(
        "planner",
        "planner_slots_unfillable",
        `slots unfillable: ${planResult.abortedSlotIds.join(", ")}`,
        { abortedSlotIds: planResult.abortedSlotIds },
      );
      await failRun(jobErr);
      return jobErr;
    }
    timeline = planResult.timeline;
  } catch (err) {
    const jobErr = makeError(
      "planner",
      "unknown",
      err instanceof Error ? err.message : String(err),
    );
    await failRun(jobErr);
    return jobErr;
  }

  // --- Step 3: Scene prompts ---
  let scenePrompts: ScenePrompt[];
  try {
    scenePrompts = runId
      ? await withStep(
          {
            runId,
            stepOrder: 3,
            stepType: "scene_prompt",
            input: { sceneCount: timeline.scenes.length, templateName },
          },
          async () => {
            const r = await writeScenePrompts({ scenes: timeline.scenes, templateName });
            return {
              output: {
                prompts: r.prompts,
                fallbackUsed: r.fallbackUsed,
              },
              externalIds: r.anthropicRequestId
                ? { anthropicRequestId: r.anthropicRequestId }
                : undefined,
              metrics: {
                tokensIn: r.tokensIn,
                tokensOut: r.tokensOut,
                cacheReadTokens: r.cacheReadTokens,
                cacheWriteTokens: r.cacheWriteTokens,
              },
              result: r.prompts,
            };
          },
        )
      : (await writeScenePrompts({ scenes: timeline.scenes, templateName })).prompts;
  } catch (err) {
    const jobErr = makeError(
      "orchestrator",
      "unknown",
      `scene_prompt: ${err instanceof Error ? err.message : String(err)}`,
    );
    await failRun(jobErr);
    return jobErr;
  }

  // --- Step 4: Scene generate (parallel, one engine_step row per scene) ---
  const sceneStepIdBySceneId = new Map<string, string>();
  let sceneGen;
  try {
    sceneGen = await generateScenes({
      scenes: timeline.scenes,
      prompts: scenePrompts,
      aspectRatio: timeline.aspectRatio,
      videoProvider: request.videoProvider,
      imagesByPath: new Map(dataset.images.map((img) => [img.path, img])),
      onSceneStart: async (scene, prompt) => {
        if (!runId) return;
        try {
          const stepId = await startStep({
            runId,
            stepOrder: 100 + scene.order, // reserve 100+ for per-scene steps
            stepType: "scene_generate",
            input: {
              sceneId: scene.sceneId,
              sceneOrder: scene.order,
              sceneRole: scene.sceneRole,
              imagePath: scene.imagePath,
              prompt: prompt.prompt,
              modelChoice: prompt.modelChoice,
              durationSec: scene.durationSec,
            },
          });
          sceneStepIdBySceneId.set(scene.sceneId, stepId);
        } catch {
          /* logged in tracking helper */
        }
      },
      onSceneTaskId: async (scene, piapiTaskId) => {
        const stepId = sceneStepIdBySceneId.get(scene.sceneId);
        if (!stepId) return;
        try {
          await finishStep({
            stepId,
            status: "running",
            externalIds: { piapiTaskId },
          });
        } catch {
          /* already logged */
        }
      },
      onSceneDone: async (scene, video) => {
        const stepId = sceneStepIdBySceneId.get(scene.sceneId);
        if (!stepId) return;
        try {
          await finishStep({
            stepId,
            status: "done",
            output: { videoUrl: video.videoUrl, durationSec: video.durationSec, model: video.model },
            externalIds: video.piapiTaskId ? { piapiTaskId: video.piapiTaskId } : undefined,
            metrics: { generationMs: video.generationMs },
          });
        } catch {
          /* already logged */
        }
      },
      onSceneFailed: async (scene, error) => {
        const stepId = sceneStepIdBySceneId.get(scene.sceneId);
        if (!stepId) return;
        try {
          await finishStep({
            stepId,
            status: "failed",
            error: { message: error.message },
          });
        } catch {
          /* already logged */
        }
      },
    });
  } catch (err) {
    const jobErr = makeError(
      "orchestrator",
      "unknown",
      `scene_generate: ${err instanceof Error ? err.message : String(err)}`,
    );
    await failRun(jobErr);
    return jobErr;
  }

  if (sceneGen.videos.length === 0) {
    const jobErr = makeError(
      "orchestrator",
      "unknown",
      `all ${sceneGen.failed.length} scene generations failed`,
      { failed: sceneGen.failed },
    );
    await failRun(jobErr);
    return jobErr;
  }

  // --- Step 5: Audio (optional) ---
  let voiceoverBuffer: Buffer | undefined;
  let musicBuffer: Buffer | undefined;

  if (request.voiceoverText) {
    try {
      const vo = runId
        ? await withStep(
            { runId, stepOrder: 200, stepType: "voiceover", input: { textLength: request.voiceoverText.length } },
            async () => {
              const r = await generateVoiceover({
                text: request.voiceoverText!,
                voiceId: request.voiceoverVoiceId,
              });
              return {
                output: { durationMs: r.durationMs, model: r.model, byteLength: r.byteLength },
                externalIds: { elevenlabsVoiceoverRequestId: r.requestId },
                result: r,
              };
            },
          )
        : await generateVoiceover({
            text: request.voiceoverText,
            voiceId: request.voiceoverVoiceId,
          });
      voiceoverBuffer = vo.buffer;
    } catch (err) {
      log("run.voiceoverFailed", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal: continue with video-only. The merge step handles missing audio.
    }
  }

  if (request.musicPrompt) {
    try {
      const musicDuration = Math.min(30, Math.round(timeline.totalDurationSec));
      const mu = runId
        ? await withStep(
            { runId, stepOrder: 201, stepType: "music", input: { promptLength: request.musicPrompt.length, durationSec: musicDuration } },
            async () => {
              const r = await generateBackgroundMusic({
                prompt: request.musicPrompt!,
                durationSeconds: musicDuration,
              });
              return {
                output: { durationMs: r.durationMs, model: r.model, byteLength: r.byteLength },
                externalIds: { elevenlabsMusicRequestId: r.requestId },
                result: r,
              };
            },
          )
        : await generateBackgroundMusic({
            prompt: request.musicPrompt,
            durationSeconds: musicDuration,
          });
      musicBuffer = mu.buffer;
    } catch (err) {
      log("run.musicFailed", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal: continue with video + voiceover (or video-only).
    }
  }

  // --- Step 6: Merge ---
  let mergeResult;
  try {
    mergeResult = runId
      ? await withStep(
          {
            runId,
            stepOrder: 300,
            stepType: "merge",
            input: {
              sceneCount: sceneGen.videos.length,
              hasVoiceover: !!voiceoverBuffer,
              hasMusic: !!musicBuffer,
            },
          },
          async () => {
            const r = await mergeScenes({
              scenes: timeline.scenes,
              videos: sceneGen.videos,
              outputPath,
              voiceoverBuffer,
              musicBuffer,
              musicVolume: request.musicVolume,
            });
            return {
              output: {
                outputPath: r.outputPath,
                durationSec: r.durationSec,
                sizeBytes: r.sizeBytes,
                sceneCount: r.sceneCount,
              },
              metrics: { renderMs: r.renderMs },
              result: r,
            };
          },
        )
      : await mergeScenes({
          scenes: timeline.scenes,
          videos: sceneGen.videos,
          outputPath,
          voiceoverBuffer,
          musicBuffer,
          musicVolume: request.musicVolume,
        });
  } catch (err) {
    const jobErr = makeError(
      "renderer",
      "renderer_ffmpeg_failure",
      err instanceof Error ? err.message : String(err),
    );
    await failRun(jobErr);
    return jobErr;
  }

  // --- Finalize run summary ---
  if (runId) {
    const baseImages = datasetToImageSummary(dataset);
    const images = mergeSceneInfoIntoSummary(
      baseImages,
      timeline.scenes,
      scenePrompts,
      sceneGen.videos,
    );
    try {
      await mergeRunSummary(runId, {
        images,
        timeline: {
          templateName: timeline.templateName,
          totalDurationSec: timeline.totalDurationSec,
          aspectRatio: timeline.aspectRatio,
          resolution: timeline.resolution,
          fps: timeline.fps,
          sceneIds: timeline.scenes.map((s) => s.sceneId),
        },
        merge: {
          sceneCount: mergeResult.sceneCount,
          totalDurationSec: mergeResult.durationSec,
          outputPath: mergeResult.outputPath,
          width: mergeResult.width,
          height: mergeResult.height,
          codec: mergeResult.codec,
          sizeBytes: mergeResult.sizeBytes,
        },
        scenesFailed: sceneGen.failed,
      });
      await completeRun({ runId, status: "done" });
    } catch (err) {
      log("run.summaryFailed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const totalMs = Date.now() - startedAt;
  log("run.done", {
    totalMs,
    sceneCount: sceneGen.videos.length,
    outputPath: nodePath.resolve(outputPath),
    runId,
  });

  const result: JobResult = {
    status: "success",
    videoPath: mergeResult.outputPath,
    timeline,
    dataset,
    render: {
      outputPath: mergeResult.outputPath,
      durationSec: mergeResult.durationSec,
      sizeBytes: mergeResult.sizeBytes,
      width: mergeResult.width,
      height: mergeResult.height,
      codec: mergeResult.codec,
      renderMs: mergeResult.renderMs,
    },
    totalMs,
    runId,
    scenePrompts,
    sceneVideos: sceneGen.videos,
  };
  return result;
}
