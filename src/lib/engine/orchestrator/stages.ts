import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFile, unlink } from "node:fs/promises";

import { PutObjectCommand } from "@aws-sdk/client-s3";

import { generateVoiceover } from "@/lib/audio/elevenlabs";
import { mergeScenes, type MergeScenesResult } from "@/lib/engine/merge/ffmpeg";
import {
  FailureReason,
  type ImageDataset,
  type JobError,
  type Scene,
  type ScenePrompt,
  type SceneTimeline,
  type SceneVideo,
} from "@/lib/engine/models";
import { planTimeline } from "@/lib/engine/planner/planner";
import { writeScenePrompts } from "@/lib/engine/prompt-writer/writer";
import {
  generateScenes,
  type VideoProviderName,
} from "@/lib/engine/scene-generator/generator";
import { loadTemplate } from "@/lib/engine/templates/loader";
import {
  appendEngineEvent,
  findSceneAttemptId,
  findSceneRecordId,
  finishSceneAttempt,
  finishStep,
  mergeRunSummary,
  startSceneAttempt,
  startStep,
  updateScenePrompts,
  updateSceneStatus,
  upsertScenes,
  withStep,
} from "@/lib/engine/tracking/supabase";
import { analyzeImages } from "@/lib/engine/vision/analyzer";
import { evaluateSceneVideo } from "@/lib/engine/scene-evaluator/evaluator";
import {
  elevenlabsCost,
  sceneClipCost,
} from "@/lib/engine/cost/pricing";
import { getPublicUrl, r2 } from "@/lib/r2";

const HARDCODED_BACKGROUND_MUSIC_PATH = path.join(
  process.cwd(),
  "background-music-library/upbeat/miromaxmusic-music-promotion-no-copyright-513944.mp3",
);

function makeError(
  reason: FailureReason,
  message: string,
  details?: Record<string, unknown>,
): JobError {
  return {
    status: "error",
    layer:
      reason === "vision_api_failure" ||
      reason === "vision_output_invalid"
        ? "vision"
        : reason === "renderer_ffmpeg_failure"
          ? "renderer"
          : "orchestrator",
    reason,
    message,
    details,
  };
}

export function datasetToImageSummary(
  dataset: ImageDataset,
): Array<Record<string, unknown>> {
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

export function mergeSceneInfoIntoSummary(
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
      img.attemptOrder = v.attemptOrder ?? null;
      img.preparedSource = v.preparedSource ?? null;
      img.evaluation = v.evaluation ?? null;
      if (v.prompt) {
        img.finalPrompt = v.prompt.prompt;
        img.finalModelChoice = v.prompt.modelChoice;
      }
    }
  }
  return Array.from(imageByUrl.values());
}

export function buildSceneSummary(
  scenes: Scene[],
  prompts: ScenePrompt[],
  videos: SceneVideo[],
): Array<Record<string, unknown>> {
  const promptBySceneId = new Map(prompts.map((p) => [p.sceneId, p]));
  const videoBySceneId = new Map(videos.map((v) => [v.sceneId, v]));
  return scenes.map((scene) => {
    const prompt = promptBySceneId.get(scene.sceneId);
    const video = videoBySceneId.get(scene.sceneId);
    return {
      sceneId: scene.sceneId,
      order: scene.order,
      slotId: scene.slotId,
      sceneRole: scene.sceneRole,
      imagePath: scene.imagePath,
      imageRoomType: scene.imageRoomType,
      durationSec: scene.durationSec,
      motionIntent: scene.motionIntent,
      overlayText: scene.overlayText,
      transitionOut: scene.transitionOut,
      transitionDurationSec: scene.transitionDurationSec,
      prompt: prompt
        ? {
            prompt: prompt.prompt,
            modelChoice: prompt.modelChoice,
            modelReason: prompt.modelReason ?? null,
            modelParams: prompt.modelParams ?? null,
          }
        : null,
      output: video
        ? {
            videoUrl: video.videoUrl,
            model: video.model,
            piapiTaskId: video.piapiTaskId ?? null,
            durationSec: video.durationSec ?? null,
            generationMs: video.generationMs ?? null,
            attemptOrder: video.attemptOrder ?? null,
            preparedSource: video.preparedSource ?? null,
            evaluation: video.evaluation ?? null,
            prompt: video.prompt
              ? {
                  prompt: video.prompt.prompt,
                  modelChoice: video.prompt.modelChoice,
                  modelReason: video.prompt.modelReason ?? null,
                  modelParams: video.prompt.modelParams ?? null,
                }
              : null,
          }
        : null,
    };
  });
}

export interface PlanStageInput {
  runId: string;
  imagePaths: string[];
  templateName: string;
  /** Optional requested total duration for the scene planner. */
  durationSec?: number;
  /**
   * The video model every scene will run on after the orchestrator override.
   * Threaded here so the prompt writer can pick the right model-specific
   * SYSTEM_PROMPT (Kling terse motion-only vs Seedance richer atmospheric).
   */
  targetModel?: "kling" | "seedance" | "seedance-fast" | "seedance-1-fast";
}

export interface PlanStageOutput {
  dataset: ImageDataset;
  timeline: SceneTimeline;
  scenePrompts: ScenePrompt[];
}

export async function runPlanStage(
  input: PlanStageInput,
): Promise<PlanStageOutput> {
  const {
    runId,
    imagePaths,
    templateName,
    durationSec,
    targetModel = "kling",
  } = input;

  const dataset = await withStep(
    {
      runId,
      stepOrder: 1,
      stepType: "vision_analyze",
      input: { imageCount: imagePaths.length },
    },
    async () => {
      let visionCost: {
        gcvUsd: number;
        qualityCheckUsd: number;
        totalUsd: number;
        qcTokens?: {
          inputTokens?: number;
          outputTokens?: number;
          cacheReadTokens?: number;
          cacheWriteTokens?: number;
        };
      } = { gcvUsd: 0, qualityCheckUsd: 0, totalUsd: 0 };
      const analyzed = await analyzeImages(imagePaths, {
        onCost: (c) => {
          visionCost = c;
        },
      });
      return {
        output: {
          images: datasetToImageSummary(analyzed),
          usableCount: analyzed.usableCount,
          availableRoomTypes: analyzed.availableRoomTypes,
        },
        metrics: {
          imageCount: analyzed.images.length,
          costUsd: visionCost.totalUsd,
          cost: {
            gcv: { provider: "gcv", costUsd: visionCost.gcvUsd },
            qualityCheck: {
              provider: "anthropic",
              model: "claude-sonnet-4-6",
              inputTokens: visionCost.qcTokens?.inputTokens,
              outputTokens: visionCost.qcTokens?.outputTokens,
              cacheReadTokens: visionCost.qcTokens?.cacheReadTokens,
              cacheWriteTokens: visionCost.qcTokens?.cacheWriteTokens,
              costUsd: visionCost.qualityCheckUsd,
            },
          },
        },
        result: analyzed,
      };
    },
  );

  const template = loadTemplate(templateName);
  // Note: do NOT short-circuit on `usableCount < template.minUsableImages`.
  // The planner has a soft-floor path that auto-enables image reuse on every
  // slot when the image count is below the template's nominal minimum, and
  // only throws `InsufficientImages` when `usableCount === 0`. Short-circuiting
  // here would bypass that graceful-degradation path and surface a hard error
  // to users who upload (e.g.) 4 images for a 5-min template.

  const planResult = await withStep(
    {
      runId,
      stepOrder: 2,
      stepType: "plan",
      input: {
        templateName,
        ...(durationSec !== undefined ? { durationSec } : {}),
      },
    },
    async () => {
      const result = planTimeline({
        dataset,
        template,
        targetDurationSec: durationSec,
      });
      if (result.abortedSlotIds && result.abortedSlotIds.length > 0) {
        return {
          output: { abortedSlotIds: result.abortedSlotIds },
          result,
        };
      }
      return {
        output: {
          templateName: result.timeline.templateName,
          sceneCount: result.timeline.scenes.length,
          totalDurationSec: result.timeline.totalDurationSec,
          warnings: result.timeline.warnings,
          unfilledSlotIds: result.timeline.unfilledSlotIds,
        },
        result,
      };
    },
  );

  if (planResult.abortedSlotIds && planResult.abortedSlotIds.length > 0) {
    throw makeError(
      "planner_slots_unfillable",
      `slots unfillable: ${planResult.abortedSlotIds.join(", ")}`,
      { abortedSlotIds: planResult.abortedSlotIds },
    );
  }

  const timeline = planResult.timeline;
  await upsertScenes({ runId, scenes: timeline.scenes });
  await appendEngineEvent({
    runId,
    eventType: "plan.completed",
    payload: {
      sceneCount: timeline.scenes.length,
      warnings: timeline.warnings,
      unfilledSlotIds: timeline.unfilledSlotIds,
    },
  });

  const promptResult = await withStep(
    {
      runId,
      stepOrder: 3,
      stepType: "scene_prompt",
      input: { sceneCount: timeline.scenes.length, templateName },
    },
    async () => {
      const prompts = await writeScenePrompts({
        scenes: timeline.scenes,
        templateName,
        targetModel,
      });
      return {
        output: {
          prompts: prompts.prompts,
          fallbackUsed: prompts.fallbackUsed,
        },
        externalIds: prompts.anthropicRequestId
          ? { anthropicRequestId: prompts.anthropicRequestId }
          : undefined,
        metrics: {
          tokensIn: prompts.tokensIn,
          tokensOut: prompts.tokensOut,
          cacheReadTokens: prompts.cacheReadTokens,
          cacheWriteTokens: prompts.cacheWriteTokens,
          // Unified cost field — the run-level rollup sums these.
          costUsd: prompts.costUsd,
          cost: {
            provider: "anthropic" as const,
            model: "claude-sonnet-4-6",
            inputTokens: prompts.tokensIn,
            outputTokens: prompts.tokensOut,
            cacheReadTokens: prompts.cacheReadTokens,
            cacheWriteTokens: prompts.cacheWriteTokens,
            costUsd: prompts.costUsd,
          },
        },
        result: prompts,
      };
    },
  );

  await updateScenePrompts({ runId, prompts: promptResult.prompts });
  await appendEngineEvent({
    runId,
    eventType: "scene_prompt.completed",
    payload: {
      sceneCount: promptResult.prompts.length,
    },
  });

  await mergeRunSummary(runId, {
    images: datasetToImageSummary(dataset),
    timeline: {
      templateName: timeline.templateName,
      totalDurationSec: timeline.totalDurationSec,
      aspectRatio: timeline.aspectRatio,
      resolution: timeline.resolution,
      fps: timeline.fps,
      sceneIds: timeline.scenes.map((s) => s.sceneId),
    },
  });

  return {
    dataset,
    timeline,
    scenePrompts: promptResult.prompts,
  };
}

export interface SceneStageInput {
  runId: string;
  scene: Scene;
  prompt: ScenePrompt;
  aspectRatio: SceneTimeline["aspectRatio"];
  imageMeta?: ImageDataset["images"][number];
  videoProvider?: VideoProviderName;
  preparedAssetPrefix?: string;
}

export async function runSceneStage(
  input: SceneStageInput,
): Promise<SceneVideo> {
  const sceneRecordId = await findSceneRecordId(input.runId, input.scene.sceneId);
  if (!sceneRecordId) {
    throw new Error(
      `scene record missing for ${input.scene.sceneId} in run ${input.runId}`,
    );
  }

  const sceneStepIdByAttemptKey = new Map<string, string>();
  const sceneAttemptIdByAttemptKey = new Map<string, string>();
  const resolvedVideoProvider =
    input.videoProvider ??
    (process.env.ENGINE_VIDEO_PROVIDER as VideoProviderName | undefined) ??
    "kieai";

  const result = await generateScenes({
    scenes: [input.scene],
    prompts: [input.prompt],
    aspectRatio: input.aspectRatio,
    videoProvider: input.videoProvider,
    preparedAssetPrefix: input.preparedAssetPrefix,
    evaluateScenes: false,
    maxAttempts: 1,
    imagesByPath: input.imageMeta
      ? new Map([[input.imageMeta.path, input.imageMeta]])
      : undefined,
    onSceneStart: async (scene, context) => {
      const attemptKey = `${scene.sceneId}:${context.attempt}`;
      await updateSceneStatus({
        runId: input.runId,
        sceneId: scene.sceneId,
        status: "running",
        output: {
          preparedSource: context.preparedSource,
          latestAttempt: context.attempt,
        },
      });
      const attemptId = await startSceneAttempt({
        runId: input.runId,
        sceneRecordId,
        attemptOrder: context.attempt,
        provider: resolvedVideoProvider,
        modelChoice: context.prompt.modelChoice,
        prompt: {
          prompt: context.prompt.prompt,
          modelChoice: context.prompt.modelChoice,
          modelReason: context.prompt.modelReason ?? null,
          modelParams: context.prompt.modelParams ?? null,
          preparedSource: context.preparedSource,
        },
      });
      sceneAttemptIdByAttemptKey.set(attemptKey, attemptId);
      await appendEngineEvent({
        runId: input.runId,
        sceneRecordId,
        attemptId,
        eventType: "scene.attempt.started",
        payload: {
          sceneId: scene.sceneId,
          sceneOrder: scene.order,
          attempt: context.attempt,
          provider: resolvedVideoProvider,
          modelChoice: context.prompt.modelChoice,
          preparedSource: context.preparedSource,
        },
      });
      const stepId = await startStep({
        runId: input.runId,
        stepOrder: 100 + scene.order * 10 + context.attempt,
        stepType: "scene_generate",
        input: {
          sceneId: scene.sceneId,
          sceneOrder: scene.order,
          attempt: context.attempt,
          sceneRole: scene.sceneRole,
          imagePath: scene.imagePath,
          preparedSource: context.preparedSource,
          prompt: context.prompt.prompt,
          modelChoice: context.prompt.modelChoice,
          durationSec: scene.durationSec,
        },
      });
      sceneStepIdByAttemptKey.set(attemptKey, stepId);
    },
    onSceneTaskId: async (scene, piapiTaskId, context) => {
      const attemptKey = `${scene.sceneId}:${context.attempt}`;
      const stepId = sceneStepIdByAttemptKey.get(attemptKey);
      const attemptId = sceneAttemptIdByAttemptKey.get(attemptKey);
      if (!stepId) return;
      await finishStep({
        stepId,
        status: "running",
        externalIds: { piapiTaskId },
      });
      if (attemptId) {
        await finishSceneAttempt({
          attemptId,
          status: "running",
          externalIds: { piapiTaskId },
        });
      }
      await appendEngineEvent({
        runId: input.runId,
        sceneRecordId,
        attemptId: attemptId ?? null,
        eventType: "scene.taskId.received",
        payload: {
          sceneId: scene.sceneId,
          attempt: context.attempt,
          piapiTaskId,
        },
      });
    },
    onSceneDone: async (scene, video, context) => {
      const attemptKey = `${scene.sceneId}:${context.attempt}`;
      const stepId = sceneStepIdByAttemptKey.get(attemptKey);
      const attemptId = sceneAttemptIdByAttemptKey.get(attemptKey);
      if (!stepId) return;
      // Clip cost — one generation per scene. Priced per the logical model
      // (kling/seedance/seedance-fast/seedance-1-fast) + provider
      // (kieai/piapi). Zero when providerName is "test-override".
      const clipCostUsd = sceneClipCost(
        resolvedVideoProvider,
        context.prompt.modelChoice,
      );
      const clipCostEntry = {
        provider: resolvedVideoProvider,
        model: context.prompt.modelChoice,
        clipCount: 1,
        costUsd: clipCostUsd,
      };
      await finishStep({
        stepId,
        status: "done",
        output: {
          videoUrl: video.videoUrl,
          durationSec: video.durationSec,
          model: video.model,
          preparedSource: video.preparedSource ?? null,
          evaluation: video.evaluation ?? null,
        },
        externalIds: video.piapiTaskId ? { piapiTaskId: video.piapiTaskId } : undefined,
        metrics: {
          generationMs: video.generationMs,
          evaluationScore: video.evaluation?.score ?? null,
          costUsd: clipCostUsd,
          cost: clipCostEntry,
        },
      });
      if (attemptId) {
        await finishSceneAttempt({
          attemptId,
          status: "done",
          externalIds: video.piapiTaskId ? { piapiTaskId: video.piapiTaskId } : undefined,
          metrics: {
            generationMs: video.generationMs,
            evaluationScore: video.evaluation?.score ?? null,
            evaluationPassed: video.evaluation?.passed ?? null,
            costUsd: clipCostUsd,
            cost: clipCostEntry,
          },
          output: {
            videoUrl: video.videoUrl,
            durationSec: video.durationSec,
            model: video.model,
            prompt: video.prompt ?? null,
            preparedSource: video.preparedSource ?? null,
            evaluation: video.evaluation ?? null,
          },
        });
      }
      await updateSceneStatus({
        runId: input.runId,
        sceneId: scene.sceneId,
        status: "done",
        output: {
          videoUrl: video.videoUrl,
          durationSec: video.durationSec,
          model: video.model,
          piapiTaskId: video.piapiTaskId ?? null,
          generationMs: video.generationMs ?? null,
          attemptOrder: video.attemptOrder ?? null,
          prompt: video.prompt ?? null,
          preparedSource: video.preparedSource ?? null,
          evaluation: video.evaluation ?? null,
        },
      });
      await appendEngineEvent({
        runId: input.runId,
        sceneRecordId,
        attemptId: attemptId ?? null,
        eventType: "scene.completed",
        payload: {
          sceneId: scene.sceneId,
          attempt: context.attempt,
          videoUrl: video.videoUrl,
          model: video.model,
          evaluation: video.evaluation ?? null,
        },
      });
    },
    onSceneFailed: async (scene, error, context) => {
      const attemptKey = `${scene.sceneId}:${context.attempt}`;
      const stepId = sceneStepIdByAttemptKey.get(attemptKey);
      const attemptId = sceneAttemptIdByAttemptKey.get(attemptKey);
      if (!stepId) return;
      await finishStep({
        stepId,
        status: "failed",
        output: {
          preparedSource: context.preparedSource,
          evaluation: context.evaluation ?? null,
        },
        error: {
          message: error.message,
          retryReason: context.retryReason ?? null,
          willRetry: context.willRetry ?? false,
        },
      });
      if (attemptId) {
        await finishSceneAttempt({
          attemptId,
          status: "failed",
          metrics: {
            evaluationScore: context.evaluation?.score ?? null,
            evaluationPassed: context.evaluation?.passed ?? null,
          },
          output: {
            prompt: context.prompt,
            preparedSource: context.preparedSource,
            evaluation: context.evaluation ?? null,
          },
          error: {
            message: error.message,
            retryReason: context.retryReason ?? null,
            willRetry: context.willRetry ?? false,
          },
        });
      }
      await updateSceneStatus({
        runId: input.runId,
        sceneId: scene.sceneId,
        status: context.willRetry ? "running" : "failed",
        output: {
          preparedSource: context.preparedSource,
          latestAttempt: context.attempt,
          latestEvaluation: context.evaluation ?? null,
          retryReason: context.retryReason ?? null,
          nextPrompt: context.willRetry ? context.prompt.prompt : null,
        },
        error: context.willRetry
          ? null
          : { message: error.message, retryReason: context.retryReason ?? null },
      });
      await appendEngineEvent({
        runId: input.runId,
        sceneRecordId,
        attemptId: attemptId ?? null,
        eventType: context.willRetry ? "scene.retry.scheduled" : "scene.failed",
        level: context.willRetry ? "warn" : "error",
        payload: {
          sceneId: scene.sceneId,
          attempt: context.attempt,
          message: error.message,
          evaluation: context.evaluation ?? null,
          retryReason: context.retryReason ?? null,
        },
      });
    },
  });

  if (result.videos.length === 0) {
    throw new Error(result.failed[0]?.error ?? `scene ${input.scene.sceneId} failed`);
  }

  return result.videos[0];
}

export interface EvaluateSceneStageInput {
  runId: string;
  scene: Scene;
  video: SceneVideo;
  prompt: ScenePrompt;
}

export async function runEvaluateSceneStage(
  input: EvaluateSceneStageInput,
) {
  const sceneRecordId = await findSceneRecordId(input.runId, input.scene.sceneId);
  if (!sceneRecordId) {
    throw new Error(
      `scene record missing for ${input.scene.sceneId} in run ${input.runId}`,
    );
  }
  const attemptOrder = input.video.attemptOrder ?? 1;
  const attemptId = await findSceneAttemptId(
    input.runId,
    sceneRecordId,
    attemptOrder,
  );
  const stepId = await startStep({
    runId: input.runId,
    // Step-order bands to satisfy engine_steps unique(run_id, step_order):
    //   1-3    prep (vision, plan, scene_prompt)
    //   100+   scene_generate  (100 + scene.order * 10 + attempt)
    //   200s   voiceover / music
    //   300    merge
    //   500+   scene_evaluate  (500 + scene.order * 10 + attempt)
    // Generate and evaluate both key off (scene.order, attempt) but live in
    // distinct bands so their rows never collide on the same run.
    stepOrder: 500 + input.scene.order * 10 + attemptOrder,
    stepType: "scene_evaluate",
    input: {
      sceneId: input.scene.sceneId,
      sceneOrder: input.scene.order,
      attempt: attemptOrder,
      prompt: input.prompt.prompt,
      modelChoice: input.prompt.modelChoice,
      videoUrl: input.video.videoUrl,
    },
  });

  try {
    const evaluation = await evaluateSceneVideo({
      scene: input.scene,
      prompt: input.prompt,
      video: input.video,
      preparedSource:
        input.video.preparedSource ??
        (() => {
          throw new Error(
            `preparedSource missing for scene ${input.scene.sceneId} attempt ${attemptOrder}`,
          );
        })(),
    });

    const enrichedVideo: SceneVideo = {
      ...input.video,
      evaluation,
      prompt: input.prompt,
    };

    await finishStep({
      stepId,
      status: "done",
      output: {
        videoUrl: input.video.videoUrl,
        evaluation,
      },
      metrics: {
        evaluationScore: evaluation.score,
        evaluationPassed: evaluation.passed,
        tokensIn: evaluation.tokensIn,
        tokensOut: evaluation.tokensOut,
        cacheReadTokens: evaluation.cacheReadTokens,
        cacheWriteTokens: evaluation.cacheWriteTokens,
        costUsd: evaluation.costUsd ?? 0,
        cost: {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          inputTokens: evaluation.tokensIn,
          outputTokens: evaluation.tokensOut,
          cacheReadTokens: evaluation.cacheReadTokens,
          cacheWriteTokens: evaluation.cacheWriteTokens,
          costUsd: evaluation.costUsd ?? 0,
        },
      },
      externalIds: evaluation.anthropicRequestId
        ? { anthropicRequestId: evaluation.anthropicRequestId }
        : undefined,
    });
    if (attemptId) {
      await finishSceneAttempt({
        attemptId,
        status: "done",
        output: {
          videoUrl: input.video.videoUrl,
          durationSec: input.video.durationSec,
          model: input.video.model,
          prompt: input.prompt,
          preparedSource: input.video.preparedSource ?? null,
          evaluation,
        },
        metrics: {
          generationMs: input.video.generationMs,
          evaluationScore: evaluation.score,
          evaluationPassed: evaluation.passed,
          tokensIn: evaluation.tokensIn,
          tokensOut: evaluation.tokensOut,
        },
        externalIds: evaluation.anthropicRequestId
          ? { anthropicRequestId: evaluation.anthropicRequestId }
          : undefined,
      });
    }
    await updateSceneStatus({
      runId: input.runId,
      sceneId: input.scene.sceneId,
      status: evaluation.passed ? "done" : "running",
      output: {
        videoUrl: input.video.videoUrl,
        durationSec: input.video.durationSec,
        model: input.video.model,
        piapiTaskId: input.video.piapiTaskId ?? null,
        generationMs: input.video.generationMs ?? null,
        attemptOrder,
        prompt: input.prompt,
        preparedSource: input.video.preparedSource ?? null,
        evaluation,
        retryReason: evaluation.retryReason ?? null,
      },
      error: evaluation.passed
        ? null
        : {
            message: evaluation.summary,
            retryReason: evaluation.retryReason ?? null,
          },
    });
    await appendEngineEvent({
      runId: input.runId,
      sceneRecordId,
      attemptId: attemptId ?? null,
      eventType: evaluation.passed
        ? "scene.evaluation.passed"
        : "scene.evaluation.failed",
      level: evaluation.passed ? "info" : "warn",
      payload: {
        sceneId: input.scene.sceneId,
        attempt: attemptOrder,
        summary: evaluation.summary,
        score: evaluation.score,
        issues: evaluation.issues,
        retryPrompt: evaluation.retryPrompt,
        retryReason: evaluation.retryReason,
      },
    });

    return {
      evaluation,
      video: enrichedVideo,
    };
  } catch (error) {
    await finishStep({
      stepId,
      status: "failed",
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export interface AssembleStageInput {
  runId: string;
  userId: string;
  assetId: string;
  timeline: SceneTimeline;
  sceneVideos: SceneVideo[];
  voiceoverText?: string;
  voiceoverVoiceId?: string;
  musicPrompt?: string;
  musicVolume?: number;
}

export interface AssembleStageOutput {
  render: MergeScenesResult;
  publicUrl: string;
  key: string;
  uploadSizeBytes: number;
}

export async function runAssembleStage(
  input: AssembleStageInput,
): Promise<AssembleStageOutput> {
  const outputPath = path.join(
    "/tmp",
    `engine-${input.assetId}-${randomUUID()}.mp4`,
  );

  try {
    let voiceoverBuffer: Buffer | undefined;
    let musicBuffer: Buffer | undefined;

    if (input.voiceoverText) {
      const voiceover = await withStep(
        {
          runId: input.runId,
          stepOrder: 200,
          stepType: "voiceover",
          input: { textLength: input.voiceoverText.length },
        },
        async () => {
          const result = await generateVoiceover({
            text: input.voiceoverText!,
            voiceId: input.voiceoverVoiceId,
          });
          const costUsd = elevenlabsCost({
            kind: "tts",
            charCount: input.voiceoverText!.length,
          });
          return {
            output: {
              durationMs: result.durationMs,
              model: result.model,
              byteLength: result.byteLength,
            },
            externalIds: result.requestId
              ? { elevenlabsVoiceoverRequestId: result.requestId }
              : undefined,
            metrics: {
              costUsd,
              cost: {
                provider: "elevenlabs" as const,
                model: result.model,
                charCount: input.voiceoverText!.length,
                costUsd,
              },
            },
            result,
          };
        },
      );
      voiceoverBuffer = voiceover.buffer;
    }

    if (input.musicPrompt) {
      const music = await withStep(
        {
          runId: input.runId,
          stepOrder: 201,
          stepType: "music",
          input: {
            source: "repo_track",
            trackPath: HARDCODED_BACKGROUND_MUSIC_PATH,
          },
        },
        async () => {
          const buffer = await readFile(HARDCODED_BACKGROUND_MUSIC_PATH);
          return {
            output: {
              source: "repo_track",
              trackPath: HARDCODED_BACKGROUND_MUSIC_PATH,
              byteLength: buffer.byteLength,
            },
            metrics: {
              costUsd: 0,
              cost: {
                provider: "repo_track" as const,
                costUsd: 0,
              },
            },
            result: { buffer },
          };
        },
      );
      musicBuffer = music.buffer;
    }

    const render = await withStep(
      {
        runId: input.runId,
        stepOrder: 300,
        stepType: "merge",
        input: {
          sceneCount: input.sceneVideos.length,
          hasVoiceover: !!voiceoverBuffer,
          hasMusic: !!musicBuffer,
        },
      },
      async () => {
        const result = await mergeScenes({
          scenes: input.timeline.scenes,
          videos: input.sceneVideos,
          outputPath,
          voiceoverBuffer,
          musicBuffer,
          musicVolume: input.musicVolume,
        });
        return {
          output: {
            outputPath: result.outputPath,
            durationSec: result.durationSec,
            sizeBytes: result.sizeBytes,
            sceneCount: result.sceneCount,
          },
          metrics: { renderMs: result.renderMs },
          result,
        };
      },
    );

    const upload = await withStep(
      {
        runId: input.runId,
        stepOrder: 400,
        stepType: "upload",
        input: {
          contentType: "video/mp4",
          assetId: input.assetId,
        },
      },
      async () => {
        const body = await readFile(outputPath);
        const key = `${input.userId}/processed/${randomUUID()}.mp4`;
        await r2.send(
          new PutObjectCommand({
            Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
            Key: key,
            Body: body,
            ContentType: "video/mp4",
          }),
        );
        const publicUrl = getPublicUrl(key);
        await mergeRunSummary(input.runId, {
          upload: {
            key,
            publicUrl,
            contentType: "video/mp4",
            sizeBytes: body.byteLength,
          },
        });
        await appendEngineEvent({
          runId: input.runId,
          eventType: "upload.completed",
          payload: {
            key,
            publicUrl,
            sizeBytes: body.byteLength,
          },
        });
        return {
          output: { key, publicUrl, sizeBytes: body.byteLength },
          metrics: { uploadedBytes: body.byteLength },
          result: { key, publicUrl, sizeBytes: body.byteLength },
        };
      },
    );

    return {
      render,
      publicUrl: upload.publicUrl,
      key: upload.key,
      uploadSizeBytes: upload.sizeBytes,
    };
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}
