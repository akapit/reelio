import { task, logger, metadata, tags } from "@trigger.dev/sdk";

import type { SceneTimeline, SceneVideo } from "@/lib/engine/models";
import { runAssembleStage } from "@/lib/engine/orchestrator/stages";
import type { VideoLogoRenderOptions } from "@/lib/video-logo";

export const engineAssembleVideoTask = task({
  id: "engine-assemble-video",
  maxDuration: 600,
  retry: { maxAttempts: 1 },
  run: async (payload: {
    runId: string;
    assetId: string;
    userId: string;
    timeline: SceneTimeline;
    sceneVideos: SceneVideo[];
    voiceoverText?: string;
    voiceoverVoiceId?: string;
    musicPrompt?: string;
    musicVolume?: number;
    logo?: VideoLogoRenderOptions;
  }) => {
    await tags.add(`run_${payload.runId}`);
    await tags.add(`asset_${payload.assetId}`);
    metadata.set("runId", payload.runId);
    metadata.set("assetId", payload.assetId);
    metadata.set("sceneCount", payload.sceneVideos.length);

    logger.info("[engine-assemble-video] start", {
      runId: payload.runId,
      sceneCount: payload.sceneVideos.length,
      hasVoiceover: !!payload.voiceoverText,
      hasMusic: !!payload.musicPrompt,
      hasLogo: !!payload.logo,
    });

    const result = await runAssembleStage(payload);

    logger.info("[engine-assemble-video] done", {
      runId: payload.runId,
      publicUrl: result.publicUrl,
      durationSec: result.render.durationSec,
      sizeBytes: result.render.sizeBytes,
    });

    return result;
  },
});
