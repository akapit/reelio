import { task, logger, metadata, tags } from "@trigger.dev/sdk";

import type { ImageMetadata, Scene, ScenePrompt, SceneTimeline } from "@/lib/engine/models";
import { runSceneStage } from "@/lib/engine/orchestrator/stages";

export const engineGenerateSceneTask = task({
  id: "engine-generate-scene",
  maxDuration: 600,
  retry: { maxAttempts: 1 },
  run: async (payload: {
    runId: string;
    assetId: string;
    userId: string;
    scene: Scene;
    prompt: ScenePrompt;
    aspectRatio: SceneTimeline["aspectRatio"];
    imageMeta?: ImageMetadata;
    videoProvider?: "piapi" | "kieai";
    preparedAssetPrefix?: string;
  }) => {
    await tags.add(`run_${payload.runId}`);
    await tags.add(`asset_${payload.assetId}`);
    await tags.add(`scene_${payload.scene.sceneId}`);
    metadata.set("runId", payload.runId);
    metadata.set("sceneId", payload.scene.sceneId);
    metadata.set("sceneOrder", payload.scene.order);

    logger.info("[engine-generate-scene] start", {
      runId: payload.runId,
      sceneId: payload.scene.sceneId,
      order: payload.scene.order,
      modelChoice: payload.prompt.modelChoice,
      videoProvider: payload.videoProvider,
    });

    const result = await runSceneStage({
      runId: payload.runId,
      scene: payload.scene,
      prompt: payload.prompt,
      aspectRatio: payload.aspectRatio,
      imageMeta: payload.imageMeta,
      videoProvider: payload.videoProvider,
      preparedAssetPrefix: payload.preparedAssetPrefix,
    });

    logger.info("[engine-generate-scene] done", {
      runId: payload.runId,
      sceneId: payload.scene.sceneId,
      attemptOrder: result.attemptOrder,
      evaluationPassed: result.evaluation?.passed,
    });

    return result;
  },
});
