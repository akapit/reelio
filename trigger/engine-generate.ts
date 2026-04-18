import { task, logger, metadata, tags } from "@trigger.dev/sdk";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { runEngineJob } from "@/lib/engine";
import { r2, getPublicUrl } from "@/lib/r2";
import { appendAssetMetadata, updateAssetStatus } from "./_shared";

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
  }) => {
    const runStart = Date.now();
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
    });

    const outputPath = path.join("/tmp", `engine-${payload.assetId}-${randomUUID()}.mp4`);

    try {
      const result = await runEngineJob({
        imagePaths: payload.imageUrls,
        templateName: payload.templateName,
        outputPath,
        tracking: {
          assetId: payload.assetId,
          userId: payload.userId,
          projectId: payload.projectId ?? null,
        },
        voiceoverText: payload.voiceoverText,
        voiceoverVoiceId: payload.voiceoverVoiceId,
        musicPrompt: payload.musicPrompt,
        musicVolume: payload.musicVolume,
        videoProvider: payload.videoProvider,
      });

      if (result.status === "error") {
        logger.error("[engine-generate] engine returned error", {
          layer: result.layer,
          reason: result.reason,
          message: result.message,
        });
        await appendAssetMetadata(payload.assetId, { lastError: result });
        await updateAssetStatus(payload.assetId, "failed");
        throw new Error(`${result.layer}:${result.reason}: ${result.message}`);
      }

      if (result.runId) await tags.add(`run_${result.runId}`);

      const buf = await readFile(outputPath);
      const key = `${payload.userId}/processed/${randomUUID()}.mp4`;
      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
          Key: key,
          Body: buf,
          ContentType: "video/mp4",
        }),
      );
      const publicUrl = getPublicUrl(key);

      // Keep the assets row lean — the full detail lives in engine_runs.summary.
      await appendAssetMetadata(payload.assetId, {
        engine: {
          runId: result.runId,
          templateName: result.timeline.templateName,
          sceneCount: result.timeline.scenes.length,
          totalDurationSec: result.render.durationSec,
          sizeBytes: result.render.sizeBytes,
          totalMs: result.totalMs,
        },
      });
      await updateAssetStatus(payload.assetId, "done", {
        processed_url: publicUrl,
      });

      logger.info("[engine-generate] ok", {
        assetId: payload.assetId,
        runId: result.runId,
        publicUrl,
        durationSec: result.render.durationSec,
        sizeBytes: result.render.sizeBytes,
        renderMs: result.render.renderMs,
        totalMs: Date.now() - runStart,
      });

      return {
        videoUrl: publicUrl,
        runId: result.runId,
        render: result.render,
        templateName: result.timeline.templateName,
        sceneCount: result.timeline.scenes.length,
      };
    } catch (error) {
      logger.error("[engine-generate] failed", {
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
    } finally {
      await unlink(outputPath).catch(() => {});
    }
  },
});
