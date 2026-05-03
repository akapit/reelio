import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Scene, SceneVideo } from "@/lib/engine/models";
import { runFfmpeg, runFfprobe } from "@/lib/engine/renderer/ffmpegRun";
import { buildConcatGraph } from "@/lib/engine/renderer/transitions";
import { mergeAudioWithVideo } from "@/lib/audio/merge";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MergeScenesInput {
  /** Scenes in playback order. */
  scenes: Scene[];
  /** SceneVideo results — any order; matched by sceneId. */
  videos: SceneVideo[];
  /** Local FS path where the final MP4 will be written. */
  outputPath: string;
  /** Optional ElevenLabs TTS audio buffer. */
  voiceoverBuffer?: Buffer;
  /** Optional music audio buffer. */
  musicBuffer?: Buffer;
  /** Music volume 0..1 (default 0.2). */
  musicVolume?: number;
  /**
   * Hard cap for the muxed output. Defaults to the probed visual concat
   * duration when audio is present, so long music beds cannot extend the MP4.
   */
  maxDurationSec?: number;
  /** Scratch dir for intermediates. Defaults to os.tmpdir(). */
  tmpDir?: string;
}

export interface MergeScenesResult {
  outputPath: string;
  durationSec: number;
  sizeBytes: number;
  width: number;
  height: number;
  codec: string;
  renderMs: number;
  sceneCount: number;
  totalTransitionSec: number;
}

// ---------------------------------------------------------------------------
// Internal logging
// ---------------------------------------------------------------------------

function log(
  event: string,
  data: Record<string, unknown> = {},
): void {
  try {
    console.log(JSON.stringify({ source: "engine.merge", event, ...data }));
  } catch {
    // logging must never throw
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function mergeScenes(
  input: MergeScenesInput,
): Promise<MergeScenesResult> {
  const started = Date.now();

  const {
    scenes,
    videos,
    outputPath,
    voiceoverBuffer,
    musicBuffer,
    musicVolume = 0.2,
  } = input;

  if (scenes.length === 0) {
    throw new Error("merge: scenes array must not be empty");
  }

  // Sort scenes by declared order so the caller doesn't have to pre-sort.
  const orderedScenes = [...scenes].sort((a, b) => a.order - b.order);

  // Build a quick-lookup map by sceneId.
  const videoBySceneId = new Map<string, SceneVideo>(
    videos.map((v) => [v.sceneId, v]),
  );

  // Create a per-merge scratch directory inside tmpDir.
  const baseTmp = input.tmpDir ?? os.tmpdir();
  const scratch = await fsp.mkdtemp(path.join(baseTmp, "engine-merge-"));

  // Accumulate paths to clean up in the finally block.
  const downloadedPaths: string[] = [];
  let concatPath: string | null = null;

  try {
    // ------------------------------------------------------------------
    // Step 1 — download each scene MP4 to local scratch.
    // ------------------------------------------------------------------
    const scenePaths: string[] = [];

    for (const scene of orderedScenes) {
      const video = videoBySceneId.get(scene.sceneId);
      if (!video) {
        throw new Error(
          `merge: no SceneVideo found for sceneId "${scene.sceneId}"`,
        );
      }

      const localPath = path.join(
        scratch,
        `scene_${scene.order}_${scene.sceneId}.mp4`,
      );

      const dlStart = Date.now();
      log("download.start", {
        sceneId: scene.sceneId,
        order: scene.order,
        videoUrl: video.videoUrl,
      });

      try {
        const response = await fetch(video.videoUrl);
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} ${response.statusText}`,
          );
        }
        const arrayBuffer = await response.arrayBuffer();
        await fsp.writeFile(localPath, Buffer.from(arrayBuffer));
      } catch (err) {
        throw new Error(
          `merge: download scene ${scene.order} (${scene.sceneId}) failed: ${String(err)}`,
        );
      }

      downloadedPaths.push(localPath);
      scenePaths.push(localPath);

      log("download.done", {
        sceneId: scene.sceneId,
        order: scene.order,
        durationMs: Date.now() - dlStart,
      });
    }

    // ------------------------------------------------------------------
    // Step 2 — concatenate with xfade transitions (or pass-through for
    // a single scene).
    // ------------------------------------------------------------------
    concatPath = path.join(scratch, "concat.mp4");

    const concatStart = Date.now();
    log("concat.start", {
      sceneCount: orderedScenes.length,
      concatPath,
    });

    if (orderedScenes.length === 1) {
      // Single scene: no xfade needed — just copy the file.
      await fsp.copyFile(scenePaths[0], concatPath);
    } else {
      // Probe every clip so we can detect dimension drift between scenes.
      // Kling 2.5 usually returns 1920x1080 but occasionally emits a nearby
      // size (e.g. 1928x1072) depending on how it interprets the source AR;
      // xfade then errors out because its two inputs must match exactly.
      // Fix: pick the most-common dimensions as the target and have
      // buildConcatGraph emit a per-input scale+crop normalization filter.
      const probes = await Promise.all(
        scenePaths.map((p) => runFfprobe(p)),
      );
      const dimCounts = new Map<string, { w: number; h: number; count: number }>();
      for (const p of probes) {
        const key = `${p.width}x${p.height}`;
        const existing = dimCounts.get(key);
        if (existing) existing.count += 1;
        else dimCounts.set(key, { w: p.width, h: p.height, count: 1 });
      }
      const modal = [...dimCounts.values()].sort((a, b) => b.count - a.count)[0];
      const target = { width: modal.w, height: modal.h };
      const mismatchCount = probes.filter(
        (p) => p.width !== target.width || p.height !== target.height,
      ).length;
      log("concat.normalize", {
        target,
        inputCount: probes.length,
        mismatchCount,
        distinctSizes: [...dimCounts.keys()],
      });

      // buildConcatGraph requires shots that expose `transitionOut` and
      // `durationSec` — Scene satisfies that interface directly.
      const { args: concatInputArgs, filter: concatFilter } = buildConcatGraph(
        scenePaths,
        orderedScenes,
        { target },
      );

      const concatArgs = [
        "-y",
        ...concatInputArgs,
        "-filter_complex",
        concatFilter,
        "-map",
        "[vout]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        concatPath,
      ];

      try {
        await runFfmpeg(concatArgs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`merge: ffmpeg concat failed: ${msg}`);
      }
    }

    log("concat.done", {
      sceneCount: orderedScenes.length,
      durationMs: Date.now() - concatStart,
    });

    // ------------------------------------------------------------------
    // Step 3 — audio mux (or rename if no audio).
    // ------------------------------------------------------------------
    const hasAudio = Boolean(voiceoverBuffer) || Boolean(musicBuffer);

    if (!hasAudio) {
      // No audio — concat output is the final output.
      await fsp.copyFile(concatPath, outputPath);
    } else {
      const concatProbe = await runFfprobe(concatPath);
      const maxDurationSec = input.maxDurationSec ?? concatProbe.durationSec;
      const audioStart = Date.now();
      log("audio.start", {
        hasVoiceover: Boolean(voiceoverBuffer),
        hasMusic: Boolean(musicBuffer),
        musicVolume,
        maxDurationSec,
      });

      // Read the concat video back as a buffer so we can pass it to the
      // existing mergeAudioWithVideo helper (which works entirely in-memory
      // using its own tmp dir).
      const videoBuffer = await fsp.readFile(concatPath);

      let merged: Buffer;
      try {
        merged = mergeAudioWithVideo({
          videoBuffer,
          voiceoverBuffer,
          musicBuffer,
          musicVolume,
          maxDurationSec,
        });
      } catch (err) {
        throw new Error(
          `merge: audio mux failed: ${String(err)}`,
        );
      }

      await fsp.writeFile(outputPath, merged);

      log("audio.done", {
        durationMs: Date.now() - audioStart,
        sizeBytes: merged.byteLength,
      });
    }

    // ------------------------------------------------------------------
    // Step 4 — probe final output.
    // ------------------------------------------------------------------
    const [stat, probe] = await Promise.all([
      fsp.stat(outputPath),
      runFfprobe(outputPath),
    ]);

    // Total transition overlap seconds = sum of transitionDurationSec for all
    // interior transitions (all scenes except the last).
    const totalTransitionSec = orderedScenes
      .slice(0, -1)
      .reduce((acc, s) => acc + s.transitionDurationSec, 0);

    const result: MergeScenesResult = {
      outputPath,
      durationSec: probe.durationSec,
      sizeBytes: stat.size,
      width: probe.width,
      height: probe.height,
      codec: probe.codec,
      renderMs: Date.now() - started,
      sceneCount: orderedScenes.length,
      totalTransitionSec,
    };

    log("probe.done", {
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes,
      codec: result.codec,
      renderMs: result.renderMs,
    });

    return result;
  } finally {
    // Clean up downloaded scene files and intermediate concat, but not the
    // final outputPath (which lives outside scratch).
    const toDelete = [...downloadedPaths];
    if (concatPath !== null) {
      toDelete.push(concatPath);
    }

    await Promise.all(
      toDelete.map((p) =>
        fsp.unlink(p).catch(() => {
          // best-effort; ignore ENOENT
        }),
      ),
    );

    // Remove the scratch dir itself (now empty).
    await fsp.rmdir(scratch).catch(() => {
      // best-effort; ignore if not empty (e.g. mergeAudioWithVideo left files)
    });
  }
}
