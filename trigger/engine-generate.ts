import { task, logger, metadata, tags } from "@trigger.dev/sdk";
import type { ScenePrompt, SceneVideo } from "@/lib/engine/models";
import { resolveDefaultVideoModel } from "@/lib/engine/models";

import {
  appendEngineEvent,
  completeRun,
  mergeRunSummary,
  updateSceneStatus,
  startRun,
} from "@/lib/engine/tracking/supabase";
import {
  buildSceneSummary,
  datasetToImageSummary,
  mergeSceneInfoIntoSummary,
} from "@/lib/engine/orchestrator/stages";
import { appendAssetMetadata, updateAssetStatus } from "./_shared";
import { engineAssembleVideoTask } from "./engine-assemble-video";
import { engineEvaluateSceneTask } from "./engine-evaluate-scene";
import { engineFinalizeAssetTask } from "./engine-finalize-asset";
import { engineGenerateSceneTask } from "./engine-generate-scene";
import { enginePlanRunTask } from "./engine-plan-run";

function resultErrorMessage(result: { error: unknown }): string {
  const error = result.error;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function buildRetryPrompt(
  prompt: {
    sceneId: string;
    prompt: string;
    modelChoice: "kling" | "seedance" | "seedance-fast";
    modelReason?: string;
    modelParams?: { mode?: "std" | "pro"; cameraMovement?: string };
  },
  feedback?: string | null,
) {
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

export const engineGenerateTask = task({
  id: "engine-generate",
  maxDuration: 600,
  retry: { maxAttempts: 1 },
  run: async (payload: {
    assetId: string;
    userId: string;
    projectId?: string | null;
    imageUrls: string[];
    templateName: string;
    voiceoverText?: string;
    voiceoverVoiceId?: string;
    musicPrompt?: string;
    musicVolume?: number;
    videoProvider?: "piapi" | "kieai";
    /** User-selected model. When set, every scene's modelChoice is overridden
     *  after the prompt writer returns. See "hard override" logic below. */
    modelChoice?: "kling" | "seedance" | "seedance-fast";
  }) => {
    const runStart = Date.now();
    let trackedRunId: string | undefined;

    await tags.add(`asset_${payload.assetId}`);
    await tags.add(`user_${payload.userId}`);
    await tags.add(`template_${payload.templateName}`);
    metadata.set("assetId", payload.assetId);
    metadata.set("templateName", payload.templateName);
    metadata.set("imageCount", payload.imageUrls.length);

    logger.info("[engine-generate] start", {
      assetId: payload.assetId,
      imageCount: payload.imageUrls.length,
      templateName: payload.templateName,
      hasVoiceover: !!payload.voiceoverText,
      hasMusic: !!payload.musicPrompt,
      videoProvider: payload.videoProvider,
    });

    try {
      trackedRunId = await startRun({
        assetId: payload.assetId,
        userId: payload.userId,
        projectId: payload.projectId ?? null,
        input: {
          imagePaths: payload.imageUrls,
          templateName: payload.templateName,
          hasVoiceover: !!payload.voiceoverText,
          hasMusic: !!payload.musicPrompt,
          musicVolume: payload.musicVolume,
          videoProvider: payload.videoProvider,
        },
      });
      metadata.set("runId", trackedRunId);
      await tags.add(`run_${trackedRunId}`);
      await appendEngineEvent({
        runId: trackedRunId,
        eventType: "run.started",
        payload: {
          imageCount: payload.imageUrls.length,
          templateName: payload.templateName,
          videoProvider: payload.videoProvider ?? "piapi",
        },
      });

      // Resolve the effective model BEFORE planning so the prompt writer
      // inside the plan task can pick the right model-specific SYSTEM_PROMPT
      // (Kling terse motion-only vs Seedance richer atmospheric). Same
      // precedence we apply later for the hard override.
      const effectiveModel =
        payload.modelChoice ?? resolveDefaultVideoModel();

      const planResult = await enginePlanRunTask.triggerAndWait({
        runId: trackedRunId,
        assetId: payload.assetId,
        userId: payload.userId,
        imageUrls: payload.imageUrls,
        templateName: payload.templateName,
        targetModel: effectiveModel,
      });
      if (!planResult.ok) {
        throw new Error(`engine-plan-run failed: ${resultErrorMessage(planResult)}`);
      }

      const { dataset, timeline, scenePrompts } = planResult.output;

      // Surface planner warnings as events so the inspector can show them
      // inline on the run. Today the only warning we care about is the slot
      // trim ("X slots -> Y slots because only Y images were usable"); the
      // AR-mismatch warnings stay in timeline.warnings as raw strings.
      const trimWarning = (timeline.warnings ?? []).find((w) =>
        w.startsWith("slots_trimmed:"),
      );
      if (trimWarning) {
        const match = trimWarning.match(
          /slots_trimmed:(\d+)->(\d+):images=(\d+)/,
        );
        await appendEngineEvent({
          runId: trackedRunId!,
          eventType: "planner.slotsTrimmed",
          payload: match
            ? {
                fromCount: Number(match[1]),
                toCount: Number(match[2]),
                usableCount: Number(match[3]),
              }
            : { raw: trimWarning },
          level: "warn",
        });
      }

      // Hard override: every scene uses ONE model for the whole run. The
      // `effectiveModel` was resolved before planning (precedence:
      // payload.modelChoice -> ENGINE_DEFAULT_MODEL env -> "kling"). The LLM
      // still writes the motion prompt; only `modelChoice` and `modelReason`
      // are rewritten. One `scene.modelOverridden` event per overridden scene
      // lands in `engine_events` so the inspector shows the LLM's original
      // pick alongside the effective choice.
      const overrideSource = payload.modelChoice ? "user" : "server_default";
      for (let i = 0; i < scenePrompts.length; i++) {
        const p = scenePrompts[i];
        if (p.modelChoice !== effectiveModel) {
          await appendEngineEvent({
            runId: trackedRunId!,
            eventType: "scene.modelOverridden",
            payload: {
              sceneId: p.sceneId,
              fromLLM: p.modelChoice,
              toEffective: effectiveModel,
              source: overrideSource,
            },
          });
          scenePrompts[i] = {
            ...p,
            modelChoice: effectiveModel,
            modelReason: `${overrideSource} override: ${effectiveModel}`,
          };
        }
      }

      const promptBySceneId = new Map(
        scenePrompts.map((prompt) => [prompt.sceneId, prompt]),
      );
      const imageMetaByPath = new Map(
        dataset.images.map((image) => [image.path, image]),
      );
      const sceneFailures: Array<{ sceneId: string; error: string }> = [];
      const acceptedSceneVideos = new Map<string, SceneVideo>();
      const retryableScenes = new Map<
        string,
        {
          retryPrompt: string | null;
          retryReason: string | null;
        }
      >();

      // Concurrency cap per round. Provider-aware defaults:
      //   - kieai: 8 (plan allows ~100 concurrent, 20 req/10s)
      //   - piapi: 2 (free plan caps active tasks at 2)
      // Override via ENGINE_SCENE_CONCURRENCY env.
      const resolvedProvider =
        payload.videoProvider ??
        (process.env.ENGINE_VIDEO_PROVIDER as "piapi" | "kieai" | undefined) ??
        "kieai";
      const defaultConcurrency = resolvedProvider === "piapi" ? 2 : 8;
      const sceneConcurrency = Math.max(
        1,
        Number(process.env.ENGINE_SCENE_CONCURRENCY ?? defaultConcurrency),
      );

      const maxRounds = 2;
      for (let round = 1; round <= maxRounds; round++) {
        const scenesToGenerate = timeline.scenes.filter(
          (scene) =>
            !acceptedSceneVideos.has(scene.sceneId) &&
            (round === 1 || retryableScenes.has(scene.sceneId)),
        );
        if (scenesToGenerate.length === 0) break;

        await appendEngineEvent({
          runId: trackedRunId!,
          eventType: "round.sceneGenerate.start",
          payload: {
            round,
            sceneCount: scenesToGenerate.length,
            concurrency: sceneConcurrency,
          },
        });

        type RoundResult = {
          scene: (typeof timeline.scenes)[number];
          ok: true;
          video: SceneVideo;
        } | {
          scene: (typeof timeline.scenes)[number];
          ok: false;
          error: string;
        };
        const roundResults: RoundResult[] = [];

        for (
          let chunkStart = 0;
          chunkStart < scenesToGenerate.length;
          chunkStart += sceneConcurrency
        ) {
          const chunk = scenesToGenerate.slice(
            chunkStart,
            chunkStart + sceneConcurrency,
          );
          const chunkResults = await engineGenerateSceneTask.batchTriggerAndWait(
            chunk.map((scene) => {
              const basePrompt = promptBySceneId.get(scene.sceneId)!;
              const retryInfo = retryableScenes.get(scene.sceneId);
              const prompt =
                round > 1 && retryInfo
                  ? buildRetryPrompt(basePrompt, retryInfo.retryPrompt)
                  : basePrompt;
              promptBySceneId.set(scene.sceneId, prompt);
              return {
                payload: {
                  runId: trackedRunId!,
                  assetId: payload.assetId,
                  userId: payload.userId,
                  scene,
                  prompt,
                  aspectRatio: timeline.aspectRatio,
                  imageMeta: imageMetaByPath.get(scene.imagePath),
                  videoProvider: payload.videoProvider,
                  preparedAssetPrefix: payload.userId,
                },
              };
            }),
          );

          for (let i = 0; i < chunkResults.runs.length; i++) {
            const result = chunkResults.runs[i];
            const scene = chunk[i];
            if (result.ok) {
              roundResults.push({ scene, ok: true, video: result.output });
            } else {
              roundResults.push({
                scene,
                ok: false,
                error: resultErrorMessage(result),
              });
            }
          }
        }

        const successfulCandidates: Array<{
          scene: (typeof timeline.scenes)[number];
          prompt: ScenePrompt;
          video: SceneVideo;
        }> = [];
        for (const r of roundResults) {
          if (r.ok) {
            successfulCandidates.push({
              scene: r.scene,
              prompt: promptBySceneId.get(r.scene.sceneId)!,
              video: r.video,
            });
          } else {
            sceneFailures.push({
              sceneId: r.scene.sceneId,
              error: r.error,
            });
          }
        }

        if (successfulCandidates.length === 0) {
          continue;
        }

        // Scene evaluator bypass.
        // Setting ENGINE_EVALUATOR_BYPASS=1 short-circuits the Claude quality
        // check: every successfully-generated clip is auto-accepted, no
        // retries are scheduled, no Anthropic tokens are spent. Rationale:
        // today's evaluator prompt + 0.6 pass threshold rejects too many
        // clips that are visually acceptable (see run 7bf7d6bc — scores 0.41
        // and 0.31 for clips that looked OK to a human). Until we retune the
        // prompt / threshold, the bypass lets us ship rather than losing the
        // whole run. We still emit a `scene.evaluator.bypassed` event per
        // scene so the inspector shows the skip, and we synthesise a minimal
        // "passed" evaluation record so downstream code (scene status
        // update, retry gate) keeps working unchanged.
        const bypassEvaluator = process.env.ENGINE_EVALUATOR_BYPASS === "1";

        retryableScenes.clear();

        if (bypassEvaluator) {
          for (const candidate of successfulCandidates) {
            acceptedSceneVideos.set(candidate.scene.sceneId, candidate.video);
            await appendEngineEvent({
              runId: trackedRunId!,
              eventType: "scene.evaluator.bypassed",
              payload: {
                sceneId: candidate.scene.sceneId,
                attempt: candidate.video.attemptOrder ?? round,
                reason: "ENGINE_EVALUATOR_BYPASS=1",
              },
            });
          }
          // Skip the rest of the evaluation bookkeeping loop entirely.
          continue;
        }

        const evaluationResults = await engineEvaluateSceneTask.batchTriggerAndWait(
          successfulCandidates.map((candidate) => ({
            payload: {
              runId: trackedRunId!,
              assetId: payload.assetId,
              userId: payload.userId,
              scene: candidate.scene,
              prompt: candidate.prompt,
              video: candidate.video,
            },
          })),
        );
        for (let index = 0; index < evaluationResults.runs.length; index++) {
          const result = evaluationResults.runs[index];
          const candidate = successfulCandidates[index];
          if (!result.ok) {
            sceneFailures.push({
              sceneId: candidate.scene.sceneId,
              error: resultErrorMessage(result),
            });
            continue;
          }
          const evaluatedVideo = result.output.video;
          const evaluation = result.output.evaluation;
          if (evaluation.passed) {
            acceptedSceneVideos.set(candidate.scene.sceneId, evaluatedVideo);
            continue;
          }

          if (round < maxRounds) {
            retryableScenes.set(candidate.scene.sceneId, {
              retryPrompt: evaluation.retryPrompt,
              retryReason: evaluation.retryReason ?? evaluation.summary,
            });
            await updateSceneStatus({
              runId: trackedRunId!,
              sceneId: candidate.scene.sceneId,
              status: "running",
              output: {
                preparedSource: evaluatedVideo.preparedSource ?? null,
                latestAttempt: evaluatedVideo.attemptOrder ?? round,
                latestEvaluation: evaluation,
                retryReason: evaluation.retryReason ?? evaluation.summary,
                nextPrompt: buildRetryPrompt(
                  candidate.prompt,
                  evaluation.retryPrompt,
                ).prompt,
              },
              error: null,
            });
            await appendEngineEvent({
              runId: trackedRunId!,
              eventType: "scene.retry.scheduled",
              level: "warn",
              payload: {
                sceneId: candidate.scene.sceneId,
                attempt: evaluatedVideo.attemptOrder ?? round,
                retryReason: evaluation.retryReason ?? evaluation.summary,
              },
            });
          } else {
            sceneFailures.push({
              sceneId: candidate.scene.sceneId,
              error: evaluation.summary,
            });
            await updateSceneStatus({
              runId: trackedRunId!,
              sceneId: candidate.scene.sceneId,
              status: "failed",
              output: {
                preparedSource: evaluatedVideo.preparedSource ?? null,
                latestAttempt: evaluatedVideo.attemptOrder ?? round,
                latestEvaluation: evaluation,
                retryReason: evaluation.retryReason ?? evaluation.summary,
              },
              error: {
                message: evaluation.summary,
                retryReason: evaluation.retryReason ?? evaluation.summary,
              },
            });
            await appendEngineEvent({
              runId: trackedRunId!,
              eventType: "scene.failed",
              level: "error",
              payload: {
                sceneId: candidate.scene.sceneId,
                attempt: evaluatedVideo.attemptOrder ?? round,
                message: evaluation.summary,
                retryReason: evaluation.retryReason ?? evaluation.summary,
              },
            });
          }
        }
      }

      // Trim timeline to only the scenes that survived generation + evaluation.
      // The merge helper requires a 1:1 mapping between timeline.scenes and
      // sceneVideos (ffmpeg.ts:104 throws on any missing sceneId), so if a
      // scene failed both attempts we drop it here rather than at merge time.
      // This implements the graceful-degradation intent that was signalled by
      // the "all scenes failed" guard below but never finished for the partial
      // case. Scene order gaps are safe: mergeScenes iterates the provided
      // scene list in order, it does not rely on `scene.order` being dense.
      const survivingScenes = timeline.scenes.filter((scene) =>
        acceptedSceneVideos.has(scene.sceneId),
      );
      const sceneVideos = survivingScenes.map(
        (scene) => acceptedSceneVideos.get(scene.sceneId)!,
      );
      const finalScenePrompts = survivingScenes.map(
        (scene) => promptBySceneId.get(scene.sceneId)!,
      );

      if (sceneVideos.length === 0) {
        throw new Error(
          `all ${sceneFailures.length} scene generations failed`,
        );
      }

      const droppedSceneIds = timeline.scenes
        .filter((scene) => !acceptedSceneVideos.has(scene.sceneId))
        .map((scene) => scene.sceneId);

      // When any scene failed, build a trimmed timeline for assemble + summary.
      // totalDurationSec is recomputed from the surviving scenes so the run
      // summary / finalize event report the real on-disk duration rather than
      // the planned target. We do NOT redistribute duration across survivors:
      // each successful clip is already the duration it was generated at, so
      // stretching/compressing would require re-rendering.
      const effectiveTimeline =
        droppedSceneIds.length === 0
          ? timeline
          : {
              ...timeline,
              scenes: survivingScenes,
              totalDurationSec: survivingScenes.reduce(
                (sum, scene) => sum + scene.durationSec,
                0,
              ),
              warnings: [
                ...(timeline.warnings ?? []),
                `scenes_dropped:${droppedSceneIds.length}:ids=${droppedSceneIds.join(",")}`,
              ],
            };

      if (droppedSceneIds.length > 0) {
        await appendEngineEvent({
          runId: trackedRunId!,
          eventType: "run.partialAssemble",
          level: "warn",
          payload: {
            plannedSceneCount: timeline.scenes.length,
            survivingSceneCount: survivingScenes.length,
            droppedSceneIds,
            plannedDurationSec: timeline.totalDurationSec,
            effectiveDurationSec: effectiveTimeline.totalDurationSec,
          },
        });
      }

      const assembleResult = await engineAssembleVideoTask.triggerAndWait({
        runId: trackedRunId,
        assetId: payload.assetId,
        userId: payload.userId,
        timeline: effectiveTimeline,
        sceneVideos,
        ...(payload.voiceoverText ? { voiceoverText: payload.voiceoverText } : {}),
        ...(payload.voiceoverVoiceId
          ? { voiceoverVoiceId: payload.voiceoverVoiceId }
          : {}),
        ...(payload.musicPrompt ? { musicPrompt: payload.musicPrompt } : {}),
        ...(payload.musicVolume !== undefined
          ? { musicVolume: payload.musicVolume }
          : {}),
      });
      if (!assembleResult.ok) {
        throw new Error(
          `engine-assemble-video failed: ${resultErrorMessage(assembleResult)}`,
        );
      }

      const images = mergeSceneInfoIntoSummary(
        datasetToImageSummary(dataset),
        effectiveTimeline.scenes,
        finalScenePrompts,
        sceneVideos,
      );
      await mergeRunSummary(trackedRunId, {
        images,
        scenes: buildSceneSummary(
          effectiveTimeline.scenes,
          finalScenePrompts,
          sceneVideos,
        ),
        timeline: {
          templateName: effectiveTimeline.templateName,
          totalDurationSec: effectiveTimeline.totalDurationSec,
          aspectRatio: effectiveTimeline.aspectRatio,
          resolution: effectiveTimeline.resolution,
          fps: effectiveTimeline.fps,
          sceneIds: effectiveTimeline.scenes.map((scene) => scene.sceneId),
        },
        merge: {
          sceneCount: assembleResult.output.render.sceneCount,
          totalDurationSec: assembleResult.output.render.durationSec,
          outputPath: assembleResult.output.render.outputPath,
          width: assembleResult.output.render.width,
          height: assembleResult.output.render.height,
          codec: assembleResult.output.render.codec,
          sizeBytes: assembleResult.output.render.sizeBytes,
        },
        scenesFailed: sceneFailures,
      });

      const finalizeResult = await engineFinalizeAssetTask.triggerAndWait({
        runId: trackedRunId,
        assetId: payload.assetId,
        userId: payload.userId,
        templateName: effectiveTimeline.templateName,
        sceneCount: effectiveTimeline.scenes.length,
        publicUrl: assembleResult.output.publicUrl,
        durationSec: assembleResult.output.render.durationSec,
        sizeBytes: assembleResult.output.render.sizeBytes,
        totalMs: Date.now() - runStart,
      });
      if (!finalizeResult.ok) {
        throw new Error(
          `engine-finalize-asset failed: ${resultErrorMessage(finalizeResult)}`,
        );
      }

      logger.info("[engine-generate] ok", {
        assetId: payload.assetId,
        runId: trackedRunId,
        publicUrl: assembleResult.output.publicUrl,
        durationSec: assembleResult.output.render.durationSec,
        sizeBytes: assembleResult.output.render.sizeBytes,
        renderMs: assembleResult.output.render.renderMs,
        totalMs: Date.now() - runStart,
        sceneFailures: sceneFailures.length,
      });

      return {
        videoUrl: assembleResult.output.publicUrl,
        runId: trackedRunId,
        render: assembleResult.output.render,
        templateName: effectiveTimeline.templateName,
        sceneCount: effectiveTimeline.scenes.length,
      };
    } catch (error) {
      logger.error("[engine-generate] failed", {
        assetId: payload.assetId,
        runId: trackedRunId,
        totalMs: Date.now() - runStart,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (trackedRunId) {
        await appendEngineEvent({
          runId: trackedRunId,
          eventType: "run.failed",
          level: "error",
          payload: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        await completeRun({
          runId: trackedRunId,
          status: "failed",
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
      await appendAssetMetadata(payload.assetId, {
        lastError: {
          message: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        },
      });
      await updateAssetStatus(payload.assetId, "failed");
      throw error;
    }
  },
});
