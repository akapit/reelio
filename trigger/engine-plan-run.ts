import { task, logger, metadata, tags } from "@trigger.dev/sdk";

import { runPlanStage } from "@/lib/engine/orchestrator/stages";

export const enginePlanRunTask = task({
  id: "engine-plan-run",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async (payload: {
    runId: string;
    assetId: string;
    userId: string;
    imageUrls: string[];
    templateName: string;
    /** Pre-resolved effective video model (user override OR env default).
     *  Drives the writer's model-specific SYSTEM_PROMPT. */
    targetModel?: "kling" | "seedance" | "seedance-fast";
  }) => {
    await tags.add(`run_${payload.runId}`);
    await tags.add(`asset_${payload.assetId}`);
    await tags.add(`user_${payload.userId}`);
    metadata.set("runId", payload.runId);
    metadata.set("assetId", payload.assetId);
    metadata.set("templateName", payload.templateName);

    logger.info("[engine-plan-run] start", {
      runId: payload.runId,
      imageCount: payload.imageUrls.length,
      templateName: payload.templateName,
      targetModel: payload.targetModel,
    });

    const result = await runPlanStage({
      runId: payload.runId,
      imagePaths: payload.imageUrls,
      templateName: payload.templateName,
      ...(payload.targetModel ? { targetModel: payload.targetModel } : {}),
    });

    logger.info("[engine-plan-run] done", {
      runId: payload.runId,
      sceneCount: result.timeline.scenes.length,
    });

    return result;
  },
});
