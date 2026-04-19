import { task, logger, metadata, tags } from "@trigger.dev/sdk";

import type { Scene, ScenePrompt, SceneVideo } from "@/lib/engine/models";
import { runEvaluateSceneStage } from "@/lib/engine/orchestrator/stages";

export const engineEvaluateSceneTask = task({
  id: "engine-evaluate-scene",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async (payload: {
    runId: string;
    assetId: string;
    userId: string;
    scene: Scene;
    prompt: ScenePrompt;
    video: SceneVideo;
  }) => {
    await tags.add(`run_${payload.runId}`);
    await tags.add(`asset_${payload.assetId}`);
    await tags.add(`scene_${payload.scene.sceneId}`);
    metadata.set("runId", payload.runId);
    metadata.set("sceneId", payload.scene.sceneId);
    metadata.set("attemptOrder", payload.video.attemptOrder ?? 1);

    logger.info("[engine-evaluate-scene] start", {
      runId: payload.runId,
      sceneId: payload.scene.sceneId,
      attemptOrder: payload.video.attemptOrder ?? 1,
      videoUrl: payload.video.videoUrl,
    });

    const result = await runEvaluateSceneStage({
      runId: payload.runId,
      scene: payload.scene,
      video: payload.video,
      prompt: payload.prompt,
    });

    logger.info("[engine-evaluate-scene] done", {
      runId: payload.runId,
      sceneId: payload.scene.sceneId,
      passed: result.evaluation.passed,
      score: result.evaluation.score,
    });

    return result;
  },
});
