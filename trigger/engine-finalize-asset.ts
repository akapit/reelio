import { task, logger, metadata, tags } from "@trigger.dev/sdk";

import {
  withStep,
  completeRun,
  appendEngineEvent,
  computeRunCostSummary,
  mergeRunSummary,
} from "@/lib/engine/tracking/supabase";
import { appendAssetMetadata, updateAssetStatus } from "./_shared";

export const engineFinalizeAssetTask = task({
  id: "engine-finalize-asset",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async (payload: {
    runId: string;
    assetId: string;
    userId: string;
    templateName: string;
    sceneCount: number;
    publicUrl: string;
    durationSec: number;
    sizeBytes: number;
    totalMs: number;
  }) => {
    await tags.add(`run_${payload.runId}`);
    await tags.add(`asset_${payload.assetId}`);
    metadata.set("runId", payload.runId);
    metadata.set("assetId", payload.assetId);

    logger.info("[engine-finalize-asset] start", {
      runId: payload.runId,
      assetId: payload.assetId,
      publicUrl: payload.publicUrl,
    });

    await withStep(
      {
        runId: payload.runId,
        // 700 — dedicated band. Leaves the 500s free for scene_evaluate
        // (500 + scene.order*10 + attempt), the 600s free for future per-scene
        // steps, and keeps finalize distinct so the unique (run_id, step_order)
        // constraint never collides.
        stepOrder: 700,
        stepType: "finalize_asset",
        input: {
          assetId: payload.assetId,
          publicUrl: payload.publicUrl,
        },
      },
      async () => {
        // Aggregate per-step costs into a single run-level summary. Best-
        // effort: failures are logged but don't block finalize.
        let cost: Awaited<ReturnType<typeof computeRunCostSummary>> | undefined;
        try {
          cost = await computeRunCostSummary(payload.runId);
          await mergeRunSummary(payload.runId, { cost });
        } catch (err) {
          logger.warn("[engine-finalize-asset] cost rollup failed", {
            runId: payload.runId,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        await appendAssetMetadata(payload.assetId, {
          engine: {
            runId: payload.runId,
            templateName: payload.templateName,
            sceneCount: payload.sceneCount,
            totalDurationSec: payload.durationSec,
            sizeBytes: payload.sizeBytes,
            totalMs: payload.totalMs,
            publicUrl: payload.publicUrl,
            ...(cost ? { costUsd: cost.totalUsd } : {}),
          },
        });
        await updateAssetStatus(payload.assetId, "done", {
          processed_url: payload.publicUrl,
        });
        await appendEngineEvent({
          runId: payload.runId,
          eventType: "finalize.completed",
          payload: {
            assetId: payload.assetId,
            publicUrl: payload.publicUrl,
            ...(cost
              ? { costUsd: cost.totalUsd, costBreakdown: cost.breakdown }
              : {}),
          },
        });
        await completeRun({ runId: payload.runId, status: "done" });
        return {
          output: {
            processedUrl: payload.publicUrl,
          },
          result: {
            processedUrl: payload.publicUrl,
          },
        };
      },
    );

    logger.info("[engine-finalize-asset] done", {
      runId: payload.runId,
      assetId: payload.assetId,
    });

    return { processedUrl: payload.publicUrl };
  },
});
