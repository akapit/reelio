/**
 * Seedance single-call engine task — the "seedance mode" path.
 *
 * Unlike the scene-based `engine-generate` task (which plans N scenes and
 * fans out N Kling/Seedance i2v calls then concats with ffmpeg), this task
 * ships all <=9 reference images to ByteDance Seedance 2 in ONE
 * `generateVideo` call and lets Seedance produce a single 4-15s walkthrough
 * video. Then optionally muxes an ElevenLabs voiceover + music bed before
 * uploading to R2.
 *
 * Pipeline:
 *   1. Prompt write — Claude, seeded by the seedance2-skill rules, writes one
 *      time-segmented prompt that binds @imageK to roles (see
 *      src/lib/engine/prompt-writer/seedance-multiref.ts).
 *   2. Seedance generate — kieaiProvider.generateVideo with
 *      referenceImageUrls, model="seedance", duration clamped to [4, 15].
 *   3. Download the MP4 to memory.
 *   4. Audio (optional) — ElevenLabs voiceover + music, then
 *      mergeAudioWithVideo to produce the final buffer.
 *   5. Upload to R2, flip the placeholder asset to status=done, append
 *      metadata (externalIds, generation config).
 */

import { task, logger, metadata, tags } from "@trigger.dev/sdk";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

import { writeSeedanceMultirefPrompt } from "@/lib/engine/prompt-writer/seedance-multiref";
import { analyzeImages } from "@/lib/engine/vision/analyzer";
import { kieaiProvider } from "@/lib/media/providers/kieai";
import { generateVoiceover } from "@/lib/audio/elevenlabs";
import {
  pickBackgroundTrack,
  type MusicMood,
} from "@/lib/audio/background-music";
import { mergeAudioWithVideo } from "@/lib/audio/merge";
import { r2, getPublicUrl } from "@/lib/r2";

import {
  appendAssetMetadata,
  updateAssetStatus,
} from "./_shared";

const SEEDANCE_MIN_DURATION = 4;
const SEEDANCE_MAX_DURATION = 15;
const SEEDANCE_MAX_REFS = 9;
/**
 * Seconds of video budgeted per reference image when the caller doesn't
 * pin a duration. 2.5s/image lands at 15s for 6 refs — the natural "full
 * tour" size — while shorter uploads degrade gracefully toward the 4s
 * floor. Clamped to Seedance's valid [4, 15] window below.
 */
const SECONDS_PER_IMAGE = 2.5;

export const engineGenerateSeedanceTask = task({
  id: "engine-generate-seedance",
  maxDuration: 600,
  retry: { maxAttempts: 1 },
  run: async (payload: {
    assetId: string;
    userId: string;
    projectId?: string | null;
    imageUrls: string[];
    durationSec?: number;
    aspectRatio?: "16:9" | "9:16" | "1:1";
    /** Passed through to the prompt writer as a tone hint (template name,
     *  user-supplied mood, etc.). */
    mood?: string;
    voiceoverText?: string;
    voiceoverVoiceId?: string;
    /** Pick a track from our royalty-free R2 library for this mood. */
    musicMood?: MusicMood;
    musicVolume?: number;
  }) => {
    const runStart = Date.now();

    await tags.add(`asset_${payload.assetId}`);
    await tags.add(`user_${payload.userId}`);
    await tags.add(`mode_seedance`);
    metadata.set("assetId", payload.assetId);
    metadata.set("mode", "seedance");
    metadata.set("imageCount", payload.imageUrls.length);

    const imageUrls = payload.imageUrls.slice(0, SEEDANCE_MAX_REFS);
    if (imageUrls.length === 0) {
      throw new Error("engine-generate-seedance: imageUrls is empty");
    }
    if (payload.imageUrls.length > SEEDANCE_MAX_REFS) {
      logger.warn(
        "[engine-generate-seedance] trimming image list to Seedance cap",
        {
          received: payload.imageUrls.length,
          keptFirst: SEEDANCE_MAX_REFS,
        },
      );
    }

    // Duration: honour an explicit payload override, else auto-size from
    // image count (SECONDS_PER_IMAGE). Seedance's valid window is [4, 15].
    const rawDuration =
      payload.durationSec ?? Math.round(imageUrls.length * SECONDS_PER_IMAGE);
    const durationSec = Math.min(
      SEEDANCE_MAX_DURATION,
      Math.max(SEEDANCE_MIN_DURATION, rawDuration),
    );
    const aspectRatio = payload.aspectRatio ?? "16:9";

    logger.info("[engine-generate-seedance] start", {
      assetId: payload.assetId,
      imageCount: imageUrls.length,
      durationSec,
      aspectRatio,
      hasVoiceover: !!payload.voiceoverText,
      musicMood: payload.musicMood ?? null,
    });

    try {
      // ----- Step 1: vision analyze -----
      // GCV (+ Claude VLM quality pass) classifies each image by room type
      // and surfaces its top labels. The prompt writer consumes this as
      // "Room hints" so the ORDER it picks is grounded in structured vision
      // output, not just eyeballing thumbnails. Failures here are non-fatal:
      // we fall back to prompt-write-without-hints, which still works via
      // Claude's own multimodal vision of the attached images.
      const visionStart = Date.now();
      let imageAnalyses:
        | Array<{ roomType?: string; labels?: string[] }>
        | undefined;
      try {
        const dataset = await analyzeImages(imageUrls);
        // `analyzeImages` preserves input order — map back by path so we
        // stay aligned with imageUrls even if parallel processing reordered
        // results internally.
        const byPath = new Map(dataset.images.map((img) => [img.path, img]));
        imageAnalyses = imageUrls.map((url) => {
          const meta = byPath.get(url);
          return {
            roomType: meta?.roomType,
            labels: (meta?.visionLabels ?? [])
              .slice(0, 5)
              .map((l) => l.name),
          };
        });
        logger.info("[engine-generate-seedance] vision done", {
          imageCount: imageUrls.length,
          visionMs: Date.now() - visionStart,
          roomTypes: imageAnalyses.map((a) => a.roomType ?? "?"),
        });
      } catch (err) {
        // Non-fatal: prompt writer still works via Claude's own vision.
        logger.warn("[engine-generate-seedance] vision failed — ordering by Claude-only", {
          error: err instanceof Error ? err.message : String(err),
          visionMs: Date.now() - visionStart,
        });
      }

      // ----- Step 2: prompt write (also chooses sequence order) -----
      const promptResult = await writeSeedanceMultirefPrompt({
        imageUrls,
        imageAnalyses,
        durationSec,
        aspectRatio,
        mood: payload.mood,
        voiceoverText: payload.voiceoverText,
        // The prompt writer only uses truthiness of this to add a
        // one-line audio direction. Pass the mood name so the writer
        // knows music is present without us having to invent a prompt.
        musicPrompt: payload.musicMood,
      });
      // Reorder the actual URL list by Claude's chosen permutation — the
      // prompt's @imageK tokens are 1-based over this reordered list.
      const reorderedUrls = promptResult.order.map((i) => imageUrls[i]);
      logger.info("[engine-generate-seedance] prompt ready", {
        promptLength: promptResult.prompt.length,
        fallbackUsed: promptResult.fallbackUsed,
        order: promptResult.order,
        tokensIn: promptResult.tokensIn,
        tokensOut: promptResult.tokensOut,
      });
      await appendAssetMetadata(payload.assetId, {
        engine: {
          mode: "seedance",
          prompt: promptResult.prompt,
          promptFallbackUsed: promptResult.fallbackUsed,
          durationSec,
          aspectRatio,
          imageCount: imageUrls.length,
          order: promptResult.order,
          ...(imageAnalyses
            ? {
                roomTypes: imageAnalyses.map((a) => a.roomType ?? null),
              }
            : {}),
        },
      });

      // ----- Step 3: Seedance single-call -----
      // Model + resolution are env-controlled (`.env.local`). Defaults favor
      // speed for real-estate walkthroughs:
      //   - seedance-fast (~2-3x quicker than seedance-2 on kie.ai)
      //   - 480p  (vs 720p — faster + cheaper, plenty for 9:16 preview)
      // Flip SEEDANCE_MODE_MODEL=seedance / SEEDANCE_MODE_RESOLUTION=720p for
      // final-quality renders.
      const envModel = process.env.SEEDANCE_MODE_MODEL;
      const seedanceModel: "seedance" | "seedance-fast" =
        envModel === "seedance" ? "seedance" : "seedance-fast";
      const envResolution = process.env.SEEDANCE_MODE_RESOLUTION;
      const seedanceResolution: "480p" | "720p" =
        envResolution === "720p" ? "720p" : "480p";

      const genStart = Date.now();
      const videoResult = await kieaiProvider.generateVideo({
        prompt: promptResult.prompt,
        // Pass the REORDERED url list so @imageK in the prompt maps to the
        // same reference_image_urls[K-1] Seedance pulls.
        referenceImageUrls: reorderedUrls,
        duration: durationSec,
        aspectRatio,
        resolution: seedanceResolution,
        model: seedanceModel,
        onTaskId: async (taskId) => {
          await tags.add(`kie_${taskId}`);
          await appendAssetMetadata(payload.assetId, {
            externalIds: { kieai: { taskId } },
          });
        },
      });
      logger.info("[engine-generate-seedance] generateVideo done", {
        taskId: videoResult.externalIds?.taskId,
        outputUrl: videoResult.outputUrl,
        generationMs: Date.now() - genStart,
      });

      if (!videoResult.outputUrl) {
        throw new Error(
          "engine-generate-seedance: kieaiProvider returned empty outputUrl",
        );
      }

      // ----- Step 3: download the MP4 -----
      const dlStart = Date.now();
      const mp4Response = await fetch(videoResult.outputUrl);
      if (!mp4Response.ok) {
        throw new Error(
          `engine-generate-seedance: failed to download video (${mp4Response.status})`,
        );
      }
      const videoArrayBuffer = await mp4Response.arrayBuffer();
      let finalBuffer: Buffer = Buffer.from(videoArrayBuffer);
      logger.info("[engine-generate-seedance] video downloaded", {
        byteLength: finalBuffer.byteLength,
        downloadMs: Date.now() - dlStart,
      });

      // ----- Step 4: audio (optional) -----
      let voiceoverBuffer: Buffer | undefined;
      let musicBuffer: Buffer | undefined;

      if (payload.voiceoverText && payload.voiceoverText.trim().length > 0) {
        try {
          const vo = await generateVoiceover({
            text: payload.voiceoverText,
            voiceId: payload.voiceoverVoiceId,
          });
          voiceoverBuffer = vo.buffer;
          await appendAssetMetadata(payload.assetId, {
            externalIds: {
              elevenlabs: { voiceoverRequestId: vo.requestId },
            },
          });
        } catch (err) {
          // Non-fatal: continue without voiceover.
          logger.warn("[engine-generate-seedance] voiceover failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (payload.musicMood) {
        try {
          const pick = await pickBackgroundTrack({ mood: payload.musicMood });
          if (pick) {
            musicBuffer = pick.buffer;
            await appendAssetMetadata(payload.assetId, {
              engine: {
                music: {
                  mood: payload.musicMood,
                  key: pick.key,
                  byteLength: pick.byteLength,
                },
              },
            });
          } else {
            // Mood has no tracks yet — log and continue muted. The user
            // gets a silent render instead of a failed one.
            logger.warn(
              "[engine-generate-seedance] music library empty for mood",
              { mood: payload.musicMood },
            );
          }
        } catch (err) {
          // Non-fatal: continue without music.
          logger.warn("[engine-generate-seedance] music fetch failed", {
            mood: payload.musicMood,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (voiceoverBuffer || musicBuffer) {
        const muxStart = Date.now();
        finalBuffer = mergeAudioWithVideo({
          videoBuffer: finalBuffer,
          voiceoverBuffer,
          musicBuffer,
          musicVolume: payload.musicVolume,
          // Library tracks are typically 2-4 minutes — cap output to the
          // video's target length so we don't produce a 3-minute file
          // that's mostly silent visuals.
          maxDurationSec: durationSec,
        });
        logger.info("[engine-generate-seedance] audio muxed", {
          byteLength: finalBuffer.byteLength,
          muxMs: Date.now() - muxStart,
        });
      }

      // ----- Step 5: upload + flip asset -----
      const uploadStart = Date.now();
      const key = `${payload.userId}/processed/${randomUUID()}.mp4`;
      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
          Key: key,
          Body: new Uint8Array(finalBuffer),
          ContentType: "video/mp4",
        }),
      );
      const publicUrl = getPublicUrl(key);
      logger.info("[engine-generate-seedance] uploaded to R2", {
        key,
        byteLength: finalBuffer.byteLength,
        uploadMs: Date.now() - uploadStart,
      });

      await appendAssetMetadata(payload.assetId, {
        engine: {
          publicUrl,
          sizeBytes: finalBuffer.byteLength,
          totalMs: Date.now() - runStart,
        },
      });
      await updateAssetStatus(payload.assetId, "done", {
        processed_url: publicUrl,
      });

      logger.info("[engine-generate-seedance] ok", {
        assetId: payload.assetId,
        publicUrl,
        durationSec,
        sizeBytes: finalBuffer.byteLength,
        totalMs: Date.now() - runStart,
      });

      return {
        videoUrl: publicUrl,
        durationSec,
        sizeBytes: finalBuffer.byteLength,
        imageCount: imageUrls.length,
      };
    } catch (error) {
      logger.error("[engine-generate-seedance] failed", {
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
