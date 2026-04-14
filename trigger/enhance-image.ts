import { task, logger, metadata, tags } from "@trigger.dev/sdk";
import { getProvider } from "@/lib/media";
import { updateAssetStatus, uploadResultToR2, appendAssetMetadata } from "./_shared";

export const enhanceImageTask = task({
  id: "enhance-image",
  retry: { maxAttempts: 3 },
  run: async (payload: { assetId: string; originalUrl: string; userId: string }) => {
    const runStart = Date.now();

    await tags.add(`asset_${payload.assetId}`);
    await tags.add(`user_${payload.userId}`);
    metadata.set("assetId", payload.assetId);
    metadata.set("userId", payload.userId);

    logger.info("[enhance-image] start", { assetId: payload.assetId });
    await updateAssetStatus(payload.assetId, "processing");
    try {
      const provider = getProvider("enhance-image");
      const result = await provider.enhanceImage({
        imageUrl: payload.originalUrl,
        onTaskId: async (taskId) => {
          logger.info("[kieai] taskId minted", { taskId });
          await tags.add(`kie_${taskId}`);
          metadata.set("external.kieai.taskId", taskId);
          metadata.set("external.kieai.stage", "created");
          await appendAssetMetadata(payload.assetId, {
            externalIds: { kieai: { taskId, stage: "created", tool: "enhance" } },
          });
        },
      });
      metadata.set("external.kieai.stage", "polled");
      metadata.set("external.kieai.durationMs", result.durationMs);
      await appendAssetMetadata(payload.assetId, {
        externalIds: {
          kieai: {
            taskId: result.externalIds?.taskId ?? null,
            stage: "polled",
            model: result.model,
            durationMs: result.durationMs,
            tool: "enhance",
          },
        },
      });

      const storedUrl = await uploadResultToR2(result.outputUrl, payload.userId);

      await updateAssetStatus(payload.assetId, "done", { processed_url: storedUrl });

      logger.info("[enhance-image] ok", {
        assetId: payload.assetId,
        storedUrl,
        kieTaskId: result.externalIds?.taskId,
        totalMs: Date.now() - runStart,
      });

      return {
        storedUrl,
        provider: result.provider,
        model: result.model,
        durationMs: result.durationMs,
        externalIds: result.externalIds,
      };
    } catch (error) {
      logger.error("[enhance-image] failed", {
        assetId: payload.assetId,
        totalMs: Date.now() - runStart,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
