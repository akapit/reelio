/**
 * One-off rescue for a failed engine_runs row whose scenes generated
 * successfully but whose orchestrator died before assembly (e.g. the
 * scene_evaluate/scene_generate step_order collision bug). Rebuilds the
 * timeline + SceneVideo[] from existing DB rows, runs the assemble stage
 * (ffmpeg merge + R2 upload), then finalises the asset so the video shows up
 * in the UI.
 *
 * Trigger:
 *   POST /api/engine/rescue { runId }
 *
 * Constraints honoured:
 *   - kie.ai's `tempfile.aiquickdraw.com` URLs expire ~24-48h after creation,
 *     so rescue is strictly best-effort; if any scene fetch 404s, we fail
 *     loudly rather than ship a partial montage.
 *   - Does NOT re-dispatch scene_generate or scene_evaluate — assumes the
 *     existing engine_scene_attempts.output.videoUrl is the intended clip.
 *   - Does NOT regenerate voiceover / music; reuses whatever was in
 *     engine_runs.input.
 */

import { task, logger, metadata, tags } from "@trigger.dev/sdk";

import type { Scene, SceneTimeline, SceneVideo } from "@/lib/engine/models";
import { loadTemplate } from "@/lib/engine/templates/loader";
import { runAssembleStage } from "@/lib/engine/orchestrator/stages";
import type { VideoLogoRenderOptions } from "@/lib/video-logo";
import {
  appendEngineEvent,
  completeRun,
  computeRunCostSummary,
  mergeRunSummary,
} from "@/lib/engine/tracking/supabase";
import {
  appendAssetMetadata,
  getServiceClient,
  updateAssetStatus,
} from "./_shared";

function log(event: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(JSON.stringify({ source: "engine.rescue", event, ...data }));
  } catch {
    /* never throw from logging */
  }
}

function parseLogo(input: unknown): VideoLogoRenderOptions | undefined {
  if (!input || typeof input !== "object") return undefined;
  const logo = (input as Record<string, unknown>).logo;
  if (!logo || typeof logo !== "object") return undefined;
  const record = logo as Record<string, unknown>;
  if (typeof record.url !== "string") return undefined;
  const placement = record.placement;
  if (!placement || typeof placement !== "object") return undefined;
  return {
    url: record.url,
    placement: placement as VideoLogoRenderOptions["placement"],
  };
}

export const engineRescueRunTask = task({
  id: "engine-rescue-run",
  maxDuration: 600,
  retry: { maxAttempts: 1 },
  run: async (payload: { runId: string }) => {
    await tags.add(`rescue`);
    await tags.add(`run_${payload.runId}`);
    metadata.set("runId", payload.runId);

    const db = getServiceClient();

    // 1. Load the run + its input config.
    const runRes = await db
      .from("engine_runs")
      .select("id, asset_id, user_id, status, input")
      .eq("id", payload.runId)
      .single();
    if (runRes.error || !runRes.data) {
      throw new Error(`rescue: run ${payload.runId} not found`);
    }
    const run = runRes.data as {
      id: string;
      asset_id: string;
      user_id: string;
      status: string;
      input: Record<string, unknown>;
    };
    await tags.add(`asset_${run.asset_id}`);
    metadata.set("assetId", run.asset_id);

    // 2. Load scenes + done attempts.
    const scenesRes = await db
      .from("engine_scenes")
      .select(
        "id, scene_id, scene_order, slot_id, image_path, room_type, scene_role, duration_sec, motion_intent, overlay_text, transition_out, transition_duration_sec",
      )
      .eq("run_id", payload.runId)
      .order("scene_order", { ascending: true });
    if (scenesRes.error || !scenesRes.data || scenesRes.data.length === 0) {
      throw new Error(
        `rescue: no engine_scenes rows for run ${payload.runId}`,
      );
    }

    const attemptsRes = await db
      .from("engine_scene_attempts")
      .select(
        "id, scene_record_id, attempt_order, status, provider, model_choice, output, external_ids, completed_at",
      )
      .eq("run_id", payload.runId)
      .eq("status", "done");
    if (attemptsRes.error) {
      throw new Error(
        `rescue: failed to load attempts: ${attemptsRes.error.message}`,
      );
    }
    const doneAttempts = (attemptsRes.data ?? []) as Array<{
      id: string;
      scene_record_id: string;
      attempt_order: number;
      status: string;
      provider: string | null;
      model_choice: string | null;
      output: Record<string, unknown>;
      external_ids: Record<string, unknown>;
    }>;

    // Index: scene_record_id -> latest done attempt.
    const attemptBySceneRecordId = new Map<
      string,
      (typeof doneAttempts)[number]
    >();
    for (const att of doneAttempts) {
      const prev = attemptBySceneRecordId.get(att.scene_record_id);
      if (!prev || att.attempt_order > prev.attempt_order) {
        attemptBySceneRecordId.set(att.scene_record_id, att);
      }
    }

    // 3. Load the template (for aspectRatio, resolution, fps, music, overlays).
    const templateName = String(run.input.templateName ?? "");
    if (!templateName) {
      throw new Error(`rescue: run ${payload.runId} has no templateName`);
    }
    const template = loadTemplate(templateName);

    // 4. Mood string — prompts already in DB; we don't need to regenerate.
    //    The Scene schema requires a `templateMood` string, so reuse the
    //    template's music mood as a neutral stand-in.
    const mood = template.music.mood;

    // 5. Reconstruct Scenes + SceneVideos, skipping scenes that lost their
    //    accepted attempt (and failing loudly — we don't ship a partial cut).
    const scenes: Scene[] = [];
    const sceneVideos: SceneVideo[] = [];
    for (const row of scenesRes.data as Array<{
      id: string;
      scene_id: string;
      scene_order: number;
      slot_id: string;
      image_path: string;
      room_type: string;
      scene_role: string;
      duration_sec: number;
      motion_intent: string | null;
      overlay_text: string | null;
      transition_out: string | null;
      transition_duration_sec: number | null;
    }>) {
      const att = attemptBySceneRecordId.get(row.id);
      if (!att) {
        throw new Error(
          `rescue: scene ${row.scene_id} (order ${row.scene_order}) has no done attempt`,
        );
      }
      const videoUrl = (att.output as { videoUrl?: unknown }).videoUrl;
      if (typeof videoUrl !== "string" || !videoUrl) {
        throw new Error(
          `rescue: scene ${row.scene_id} attempt has no videoUrl in output`,
        );
      }

      const scene: Scene = {
        sceneId: row.scene_id,
        order: row.scene_order,
        slotId: row.slot_id,
        imagePath: row.image_path,
        imageRoomType: row.room_type as Scene["imageRoomType"],
        imageDominantColorsHex: [],
        imageLabels: [],
        sceneRole: row.scene_role as Scene["sceneRole"],
        durationSec: row.duration_sec,
        motionIntent: row.motion_intent ?? "",
        templateMood: mood,
        overlayText: row.overlay_text ?? null,
        transitionOut:
          (row.transition_out as Scene["transitionOut"]) ?? "cut",
        transitionDurationSec: row.transition_duration_sec ?? 0.04,
      };
      scenes.push(scene);

      const taskId =
        typeof (att.external_ids as { piapiTaskId?: unknown }).piapiTaskId ===
        "string"
          ? (att.external_ids as { piapiTaskId: string }).piapiTaskId
          : undefined;

      const video: SceneVideo = {
        sceneId: row.scene_id,
        videoUrl,
        ...(taskId ? { piapiTaskId: taskId } : {}),
        durationSec: row.duration_sec,
        model: att.model_choice ?? "kling",
        attemptOrder: att.attempt_order,
      };
      sceneVideos.push(video);
    }

    const totalDurationSec = scenes.reduce((s, x) => s + x.durationSec, 0);

    const timeline: SceneTimeline = {
      templateName: template.name,
      targetDurationSec: template.targetDurationSec,
      totalDurationSec,
      aspectRatio: template.aspectRatio,
      resolution: template.resolution,
      fps: template.fps,
      scenes,
      music: template.music,
      overlays: template.overlays,
      unfilledSlotIds: [],
      warnings: [],
    };

    log("plan.ok", {
      runId: payload.runId,
      sceneCount: scenes.length,
      totalDurationSec,
      templateName,
    });

    await appendEngineEvent({
      runId: payload.runId,
      eventType: "rescue.started",
      payload: {
        sceneCount: scenes.length,
        totalDurationSec,
      },
    });

    // 6. Assemble. Uses the same stage function as the normal pipeline; will
    //    write its OWN voiceover/music/merge engine_steps rows. If those rows
    //    already exist on the run from an earlier partial attempt this will
    //    throw on the unique constraint — for the documented failure mode
    //    (scene_evaluate dup-key) they do not.
    const voiceoverText =
      typeof run.input.voiceoverText === "string"
        ? run.input.voiceoverText
        : undefined;
    const voiceoverVoiceId =
      typeof run.input.voiceoverVoiceId === "string"
        ? run.input.voiceoverVoiceId
        : undefined;
    const musicPrompt =
      typeof run.input.musicPrompt === "string"
        ? run.input.musicPrompt
        : undefined;
    const musicVolume =
      typeof run.input.musicVolume === "number"
        ? run.input.musicVolume
        : undefined;
    const logo = parseLogo(run.input);

    const runStartedAt = Date.now();
    const assembled = await runAssembleStage({
      runId: payload.runId,
      userId: run.user_id,
      assetId: run.asset_id,
      timeline,
      sceneVideos,
      ...(voiceoverText ? { voiceoverText } : {}),
      ...(voiceoverVoiceId ? { voiceoverVoiceId } : {}),
      ...(musicPrompt ? { musicPrompt } : {}),
      ...(musicVolume !== undefined ? { musicVolume } : {}),
      ...(logo ? { logo } : {}),
    });

    log("assemble.ok", {
      runId: payload.runId,
      publicUrl: assembled.publicUrl,
      durationSec: assembled.render.durationSec,
      sizeBytes: assembled.render.sizeBytes,
    });

    // 7. Finalise asset (same fields the normal finalize task writes).
    let cost: Awaited<ReturnType<typeof computeRunCostSummary>> | undefined;
    try {
      cost = await computeRunCostSummary(payload.runId);
      await mergeRunSummary(payload.runId, { cost });
    } catch (err) {
      log("costRollup.failed", {
        runId: payload.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await appendAssetMetadata(run.asset_id, {
      engine: {
        runId: payload.runId,
        templateName,
        sceneCount: scenes.length,
        totalDurationSec: assembled.render.durationSec,
        sizeBytes: assembled.render.sizeBytes,
        totalMs: Date.now() - runStartedAt,
        publicUrl: assembled.publicUrl,
        rescued: true,
        ...(cost ? { costUsd: cost.totalUsd } : {}),
      },
    });
    await updateAssetStatus(run.asset_id, "done", {
      processed_url: assembled.publicUrl,
    });
    await appendEngineEvent({
      runId: payload.runId,
      eventType: "rescue.completed",
      payload: {
        assetId: run.asset_id,
        publicUrl: assembled.publicUrl,
        durationSec: assembled.render.durationSec,
        sizeBytes: assembled.render.sizeBytes,
      },
    });
    await completeRun({ runId: payload.runId, status: "done" });

    logger.info("[engine-rescue-run] done", {
      runId: payload.runId,
      publicUrl: assembled.publicUrl,
    });

    return {
      runId: payload.runId,
      assetId: run.asset_id,
      publicUrl: assembled.publicUrl,
      sceneCount: scenes.length,
      durationSec: assembled.render.durationSec,
      sizeBytes: assembled.render.sizeBytes,
    };
  },
});
