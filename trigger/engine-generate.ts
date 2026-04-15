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
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async (payload: {
    assetId: string;
    userId: string;
    imageUrls: string[];
    templateName: string;
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
    });

    const outputPath = path.join("/tmp", `engine-${payload.assetId}-${randomUUID()}.mp4`);

    try {
      const result = await runEngineJob({
        imagePaths: payload.imageUrls,
        templateName: payload.templateName,
        outputPath,
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

      await appendAssetMetadata(payload.assetId, {
        engine: {
          timeline: result.timeline,
          render: result.render,
          totalMs: result.totalMs,
        },
      });
      await updateAssetStatus(payload.assetId, "done", {
        processed_url: publicUrl,
      });

      logger.info("[engine-generate] ok", {
        assetId: payload.assetId,
        publicUrl,
        durationSec: result.render.durationSec,
        sizeBytes: result.render.sizeBytes,
        renderMs: result.render.renderMs,
        totalMs: Date.now() - runStart,
      });

      return {
        videoUrl: publicUrl,
        render: result.render,
        templateName: result.timeline.templateName,
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
