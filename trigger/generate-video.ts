import { task, logger, metadata, tags } from "@trigger.dev/sdk";
import { getProvider } from "@/lib/media";
import type { VideoModel } from "@/lib/media/types";
import {
  updateAssetStatus,
  uploadResultToR2,
  appendAssetMetadata,
} from "./_shared";
import { generateVoiceover, generateBackgroundMusic } from "@/lib/audio/elevenlabs";
import { mergeAudioWithVideo } from "@/lib/audio/merge";
import { concatVideos } from "@/lib/audio/concat";
import { parseKlingShots, applyEffectToShots } from "@/lib/media/prompts/kling";
import { r2, getPublicUrl } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

function logR2(event: string, data: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ source: "r2", event, ...data }));
  } catch {
    console.log(`[r2] ${event}`);
  }
}
function logR2Error(event: string, data: Record<string, unknown>): void {
  try {
    console.error(
      JSON.stringify({ source: "r2", event, level: "error", ...data }),
    );
  } catch {
    console.error(`[r2] ${event} (error)`);
  }
}

async function uploadBufferToR2(buffer: Buffer, userId: string, ext: string): Promise<string> {
  const start = Date.now();
  const key = `${userId}/processed/${randomUUID()}.${ext}`;
  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: ext === "mp4" ? "video/mp4" : `audio/${ext}`,
      })
    );
  } catch (err) {
    logR2Error("uploadBuffer.error", {
      key,
      byteLength: buffer.byteLength,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  logR2("uploadBuffer.success", {
    key,
    byteLength: buffer.byteLength,
    durationMs: Date.now() - start,
  });
  return getPublicUrl(key);
}

async function downloadToBuffer(url: string, label: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${label}: HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Kling 2.6 i2v rejects anything that isn't a JPEG/PNG/WebP image with an
 * opaque "File type not supported" 500. Our UI accepts HEIC, GIF, and even
 * MP4/MOV/WebM/AVI at upload time (for thumbnails and future tools), so a
 * source asset whose URL points to one of those will blow up at provider
 * time — with no useful per-shot context because the error is thrown from
 * inside the fan-out Promise.all.
 *
 * This helper HEADs each URL, checks the Content-Type, and returns a
 * structured result. Callers log it BEFORE firing the provider so the
 * Trigger.dev dashboard shows exactly which URL was rejected and why.
 */
const KLING_ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
type UrlPreflightResult =
  | { ok: true; contentType: string; contentLength: number | null }
  | { ok: false; reason: string; contentType: string | null; status?: number };

async function preflightKlingImageUrl(url: string): Promise<UrlPreflightResult> {
  let res: Response;
  try {
    res = await fetch(url, { method: "HEAD" });
  } catch (err) {
    return {
      ok: false,
      reason: `network error: ${err instanceof Error ? err.message : String(err)}`,
      contentType: null,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: `HEAD returned HTTP ${res.status}`,
      contentType: res.headers.get("content-type"),
      status: res.status,
    };
  }
  const rawContentType = res.headers.get("content-type") ?? "";
  const contentType = rawContentType.split(";")[0]!.trim().toLowerCase();
  const contentLengthHeader = res.headers.get("content-length");
  const contentLength = contentLengthHeader
    ? Number.parseInt(contentLengthHeader, 10)
    : null;

  if (!KLING_ALLOWED_IMAGE_CONTENT_TYPES.includes(contentType)) {
    return {
      ok: false,
      reason: `unsupported content-type "${contentType || "(missing)"}" — Kling 2.6 i2v only accepts image/jpeg, image/png, image/webp`,
      contentType: contentType || null,
    };
  }
  return { ok: true, contentType, contentLength };
}

export const generateVideoTask = task({
  id: "generate-video",
  retry: { maxAttempts: 3 },
  // 30 min cap — Kling 2.6 i2v routinely takes ~13 min per shot today via
  // kie.ai (observed Apr 2026), so 4 parallel shots + download/concat/audio
  // need ~20 min headroom. Keep pollMarketTask's maxWaitMs (1_500_000ms =
  // 25 min) inside this cap so the poll gives up before the task is killed.
  maxDuration: 1800,
  run: async (payload: {
    assetId: string;
    originalUrl: string;
    userId: string;
    prompt?: string;
    duration?: number;
    aspectRatio?: string;
    quality?: string;
    voiceoverText?: string;
    /** Optional ElevenLabs music prompt. Music is generated separately from
     * the video model and muxed onto the full-length (post-concat) video. */
    musicPrompt?: string;
    /** 0..1. Gain for the background-music bed. Defaults to 0.2 in the muxer. */
    musicVolume?: number;
    videoModel?: VideoModel;
    /** Additional reference image URLs (beyond originalUrl) attached in the UI.
     * Kling uses them per-shot; Seedance passes them as reference_image_urls. */
    referenceImageUrls?: string[];
    /** Cinematography effect phrases prepended to Kling shot prompts at
     * fan-out time. `id` is metadata-only; the phrases are the operative
     * data. Seedance ignores this (with a skip-log) in v1. */
    effect?: {
      id?: string;
      opener: string;
      transition?: string;
      closer?: string;
    };
  }) => {
    const runStart = Date.now();
    const videoModel = payload.videoModel ?? "kling";

    await tags.add(`asset_${payload.assetId}`);
    await tags.add(`user_${payload.userId}`);
    await tags.add(`model_${videoModel}`);

    metadata.set("assetId", payload.assetId);
    metadata.set("userId", payload.userId);
    metadata.set("videoModel", videoModel);

    logger.info("[generate-video] start", {
      assetId: payload.assetId,
      videoModel,
      duration: payload.duration,
      hasVoiceover: !!payload.voiceoverText,
      hasMusic: !!payload.musicPrompt,
    });

    await updateAssetStatus(payload.assetId, "processing");
    try {
      const provider = getProvider("generate-video");

      // Step 1: produce the raw video (single call for Seedance; N fan-out
      // calls + ffmpeg concat for Kling). Output is always an in-memory
      // Buffer from here on so we can mux voiceover/music uniformly afterwards.
      let rawVideoBuffer: Buffer | null = null;
      let rawVideoUrl: string | null = null;
      let providerDurationMs = 0;
      let primaryKieTaskId: string | null = null;
      // Final playable duration in seconds — used to size the music bed so
      // ElevenLabs generates the right length track. Seedance = user's pick;
      // Kling = sum of shot durations (may drift because per-shot is 5|10s).
      let finalVideoDurationSec = Math.max(1, Math.round(payload.duration ?? 5));

      if (videoModel === "kling") {
        const allImageUrls = [
          payload.originalUrl,
          ...(payload.referenceImageUrls ?? []),
        ].filter((u): u is string => typeof u === "string" && u.length > 0);

        // Pre-flight: HEAD each candidate image URL and verify it's a format
        // Kling 2.6 i2v will accept. Running before fan-out turns an opaque
        // "File type not supported" 500 (wrapped in a retry loop) into a
        // single clear error with the offending URL + content-type, and
        // fails the task on first attempt instead of burning 3× retries.
        const preflightResults = await Promise.all(
          allImageUrls.map(async (url, idx) => ({
            idx,
            url,
            result: await preflightKlingImageUrl(url),
          })),
        );
        for (const { idx, url, result } of preflightResults) {
          if (result.ok) {
            logger.info("[kling] preflight ok", {
              imageIndex: idx + 1,
              url,
              contentType: result.contentType,
              contentLength: result.contentLength,
            });
          } else {
            logger.error("[kling] preflight reject", {
              imageIndex: idx + 1,
              url,
              reason: result.reason,
              contentType: result.contentType,
            });
          }
        }
        const firstReject = preflightResults.find((p) => !p.result.ok);
        if (firstReject && !firstReject.result.ok) {
          throw new Error(
            `Kling rejected image @image${firstReject.idx + 1} (${firstReject.url}): ${firstReject.result.reason}. ` +
              `Source asset must be a JPEG, PNG, or WebP image. HEIC, GIF, and video files are not supported by Kling 2.6 i2v.`,
          );
        }

        const parsed = parseKlingShots(
          payload.prompt,
          payload.duration ?? 5,
          allImageUrls.length,
        );
        logger.info("[kling] fan-out plan", {
          mode: parsed.mode,
          shots: parsed.shots.length,
          rawShotCount: parsed.rawShotCount,
          totalDuration: parsed.totalDuration,
          mentionCount: parsed.mentionCount,
          perShotDuration: payload.duration ?? 5,
          imageCount: allImageUrls.length,
        });

        // Optional effect wrap: prepend curated cinematography phrases to the
        // first / middle / last shot prompts. Pure helper — returns a new
        // array, so `parsed.shots` stays untouched for downstream metadata.
        const wrappedShots = applyEffectToShots(parsed.shots, payload.effect);
        if (payload.effect) {
          logger.info("[kling] effectApplied", {
            effectId: payload.effect.id ?? null,
            shotCount: wrappedShots.length,
            hasOpener: !!payload.effect.opener,
            hasTransition: !!payload.effect.transition,
            hasCloser: !!payload.effect.closer,
          });
        }

        const kieTaskIds: Array<string | null> = new Array(wrappedShots.length).fill(null);
        const fanOutStart = Date.now();

        const shotResults = await Promise.all(
          wrappedShots.map(async (shot, idx) => {
            const imageUrl =
              shot.imageNumber !== null && shot.imageNumber >= 1
                ? allImageUrls[shot.imageNumber - 1]
                : undefined;
            // Log the full input before firing so a subsequent provider
            // error is correlated to shot index + URL + prompt in the
            // Trigger dashboard. Without this, Promise.all failures are
            // opaque: "error at index 0" without knowing which URL.
            logger.info("[kling] shot dispatch", {
              shotIndex: idx,
              imageNumber: shot.imageNumber,
              imageUrl: imageUrl ?? null,
              duration: shot.duration,
              promptPreview: shot.prompt.slice(0, 160),
              promptLength: shot.prompt.length,
            });
            try {
              return await provider.generateVideo({
                imageUrl,
                prompt: shot.prompt,
                duration: shot.duration,
                aspectRatio: payload.aspectRatio as "16:9" | "9:16" | "1:1" | undefined,
                model: "kling",
                onTaskId: async (taskId) => {
                  kieTaskIds[idx] = taskId;
                  await tags.add(`kie_${taskId}`);
                  logger.info("[kieai] shot taskId", { shotIndex: idx, taskId });
                },
              });
            } catch (shotErr) {
              // Re-throw with shot-level context. Promise.all will reject
              // on the first failure, but this message is what bubbles up
              // to the task error log and `assets.metadata.lastError`.
              const msg =
                shotErr instanceof Error ? shotErr.message : String(shotErr);
              logger.error("[kling] shot failed", {
                shotIndex: idx,
                imageNumber: shot.imageNumber,
                imageUrl: imageUrl ?? null,
                error: msg,
              });
              throw new Error(
                `Kling shot ${idx + 1} (image @image${shot.imageNumber ?? "?"} → ${imageUrl ?? "<none>"}) failed: ${msg}`,
              );
            }
          }),
        );
        providerDurationMs = Date.now() - fanOutStart;
        primaryKieTaskId = kieTaskIds.find((id): id is string => !!id) ?? null;

        await appendAssetMetadata(payload.assetId, {
          externalIds: {
            kieai: {
              taskIds: kieTaskIds,
              stage: "polled",
              model: shotResults[0]?.model ?? "kling-2.6/image-to-video",
              shotCount: parsed.shots.length,
              shotDurations: parsed.shots.map((s) => s.duration),
            },
          },
        });

        // Download each shot and concat.
        const shotBuffers = await Promise.all(
          shotResults.map((r, idx) =>
            downloadToBuffer(r.outputUrl, `kling shot ${idx + 1}`),
          ),
        );
        logger.info("[kling] downloaded shots", {
          totalBytes: shotBuffers.reduce((n, b) => n + b.byteLength, 0),
        });

        const concatStart = Date.now();
        rawVideoBuffer = concatVideos(shotBuffers);
        finalVideoDurationSec = parsed.totalDuration;
        logger.info("[kling] concat done", {
          shots: shotBuffers.length,
          outputBytes: rawVideoBuffer.byteLength,
          concatMs: Date.now() - concatStart,
        });
      } else {
        // Seedance (+ fast): single provider call; optional reference images
        // are handled inside the provider.
        if (payload.effect) {
          // Defensive: the UI clears effect selection on model switch, so an
          // effect payload reaching the Seedance branch is unexpected. Log it
          // so we can notice upstream bugs — but don't fail the generation.
          logger.info("[seedance] effectSkipped", {
            effectId: payload.effect.id ?? null,
            reason: "seedance-unsupported-v1",
          });
        }
        const result = await provider.generateVideo({
          imageUrl: payload.originalUrl,
          referenceImageUrls: payload.referenceImageUrls,
          prompt: payload.prompt,
          duration: payload.duration,
          aspectRatio: payload.aspectRatio as "16:9" | "9:16" | "1:1" | undefined,
          quality: payload.quality as "fast" | "quality" | undefined,
          model: videoModel,
          onTaskId: async (taskId) => {
            primaryKieTaskId = taskId;
            logger.info("[kieai] taskId minted", { taskId });
            await tags.add(`kie_${taskId}`);
            metadata.set("external.kieai.taskId", taskId);
            metadata.set("external.kieai.stage", "created");
            await appendAssetMetadata(payload.assetId, {
              externalIds: {
                kieai: { taskId, stage: "created", model: videoModel },
              },
            });
          },
        });
        metadata.set("external.kieai.stage", "polled");
        metadata.set("external.kieai.durationMs", result.durationMs);
        providerDurationMs = result.durationMs;
        rawVideoUrl = result.outputUrl;

        await appendAssetMetadata(payload.assetId, {
          externalIds: {
            kieai: {
              taskId: result.externalIds?.taskId ?? null,
              stage: "polled",
              model: result.model,
              durationMs: result.durationMs,
            },
          },
        });
      }

      // Step 2: optional audio mux. Voiceover and music are both produced by
      // ElevenLabs (separate APIs) and layered onto the final, full-length
      // video via ffmpeg. Music is generated at `finalVideoDurationSec`
      // (= concat length for Kling, = user's selected duration for Seedance)
      // so it fits the video without clipping.
      const needsAudio = !!(payload.voiceoverText || payload.musicPrompt);
      let storedUrl: string;
      if (needsAudio) {
        if (!rawVideoBuffer) {
          if (!rawVideoUrl) throw new Error("missing rawVideoUrl before audio mux");
          rawVideoBuffer = await downloadToBuffer(rawVideoUrl, "provider video");
        }

        const [voiceoverResult, musicResult] = await Promise.all([
          payload.voiceoverText
            ? generateVoiceover({ text: payload.voiceoverText })
            : Promise.resolve(undefined),
          payload.musicPrompt
            ? generateBackgroundMusic({
                prompt: payload.musicPrompt,
                durationSeconds: finalVideoDurationSec,
              })
            : Promise.resolve(undefined),
        ]);

        const elevenLabsIds: Record<string, string | null | undefined> = {};
        if (voiceoverResult) {
          elevenLabsIds.voiceoverRequestId = voiceoverResult.requestId;
          metadata.set(
            "external.elevenlabs.voiceoverRequestId",
            voiceoverResult.requestId ?? "unknown",
          );
        }
        if (musicResult) {
          elevenLabsIds.musicRequestId = musicResult.requestId;
          metadata.set(
            "external.elevenlabs.musicRequestId",
            musicResult.requestId ?? "unknown",
          );
        }
        if (Object.keys(elevenLabsIds).length > 0) {
          await appendAssetMetadata(payload.assetId, {
            externalIds: { elevenlabs: elevenLabsIds },
          });
        }

        const mergedBuffer = mergeAudioWithVideo({
          videoBuffer: rawVideoBuffer,
          voiceoverBuffer: voiceoverResult?.buffer,
          musicBuffer: musicResult?.buffer,
          musicVolume: payload.musicVolume,
        });
        storedUrl = await uploadBufferToR2(mergedBuffer, payload.userId, "mp4");
      } else if (rawVideoBuffer) {
        // Kling path always ends with a buffer (after concat) — upload it.
        storedUrl = await uploadBufferToR2(rawVideoBuffer, payload.userId, "mp4");
      } else if (rawVideoUrl) {
        // Seedance no-audio fast path: stream straight from kie.ai to R2.
        storedUrl = await uploadResultToR2(rawVideoUrl, payload.userId, "mp4");
      } else {
        throw new Error("no video output produced");
      }

      await updateAssetStatus(payload.assetId, "done", {
        processed_url: storedUrl,
        original_url: storedUrl,
      });

      logger.info("[generate-video] ok", {
        assetId: payload.assetId,
        storedUrl,
        kieTaskId: primaryKieTaskId,
        totalMs: Date.now() - runStart,
        providerMs: providerDurationMs,
      });

      return {
        storedUrl,
        provider: "kieai",
        model: videoModel,
        durationMs: providerDurationMs,
        externalIds: { taskId: primaryKieTaskId },
      };
    } catch (error) {
      logger.error("[generate-video] failed", {
        assetId: payload.assetId,
        videoModel,
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
