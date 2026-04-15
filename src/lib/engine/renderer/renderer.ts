import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import pLimit from "p-limit";

import type { RenderResult, TimelineBlueprint } from "@/lib/engine/models";
import { RenderResult as RenderResultSchema } from "@/lib/engine/models";

import {
  buildAudioTrack,
  ensureMusicExists,
} from "./audio";
import { runFfmpeg, runFfprobe } from "./ffmpegRun";
import { buildFilter as buildKenBurnsFilter } from "./kenBurns";
import { buildDrawText } from "./overlays";
import { buildConcatGraph } from "./transitions";

const FONT_PATH = path.join(process.cwd(), "public/fonts/Inter-Bold.ttf");

async function resolveFontPath(): Promise<string> {
  try {
    await fs.access(FONT_PATH);
    return FONT_PATH;
  } catch {
    return "";
  }
}

function log(event: string, data: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ source: "engine.ffmpeg", event, ...data }));
  } catch {
    // never throw from logging
  }
}

export async function renderVideo(
  timeline: TimelineBlueprint,
  outputPath: string,
): Promise<RenderResult> {
  const started = Date.now();
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "engine-"));
  log("render.start", {
    scratch,
    outputPath,
    shots: timeline.shots.length,
    totalDurationSec: timeline.totalDurationSec,
  });

  try {
    // Step 1 — render each shot in parallel.
    const limit = pLimit(4);
    const { width, height } = timeline.resolution;
    const fps = timeline.fps;

    const shots = [...timeline.shots].sort((a, b) => a.order - b.order);
    const shotPaths = await Promise.all(
      shots.map((shot) =>
        limit(async () => {
          const filter = buildKenBurnsFilter(
            shot.motion,
            shot.durationSec,
            fps,
            { width, height },
          );
          const shotPath = path.join(scratch, `shot_${shot.order}.mp4`);
          const args = [
            "-y",
            "-loop",
            "1",
            "-t",
            shot.durationSec.toString(),
            "-i",
            shot.imagePath,
            "-vf",
            `${filter},format=yuv420p`,
            "-r",
            fps.toString(),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            shotPath,
          ];
          await runFfmpeg(args);
          return shotPath;
        }),
      ),
    );

    // Step 2 — concat with xfade transitions.
    const { args: concatInputs, filter: concatFilter } = buildConcatGraph(
      shotPaths,
      shots,
    );
    const concatPath = path.join(scratch, "concat.mp4");
    const concatArgs = [
      "-y",
      ...concatInputs,
      "-filter_complex",
      concatFilter,
      "-map",
      "[vout]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-r",
      fps.toString(),
      concatPath,
    ];
    await runFfmpeg(concatArgs);

    // Step 3 — overlays (optional).
    const fontPath = await resolveFontPath();
    const drawFragments = buildDrawText(timeline, fontPath);
    let overlayedPath = concatPath;
    if (drawFragments.length > 0) {
      overlayedPath = path.join(scratch, "overlayed.mp4");
      const overlayFilter = drawFragments.join(",");
      const overlayArgs = [
        "-y",
        "-i",
        concatPath,
        "-vf",
        overlayFilter,
        "-c:v",
        "libx264",
        "-r",
        fps.toString(),
        overlayedPath,
      ];
      await runFfmpeg(overlayArgs);
    }

    // Step 4 — audio mux.
    const { musicPath, filter: audioFilter } = buildAudioTrack(timeline);
    await ensureMusicExists(musicPath);
    const muxArgs = [
      "-y",
      "-i",
      overlayedPath,
      "-i",
      musicPath,
      "-filter:a",
      audioFilter,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      outputPath,
    ];
    await runFfmpeg(muxArgs);

    // Step 5 — probe + stat.
    const [stat, probe] = await Promise.all([
      fs.stat(outputPath),
      runFfprobe(outputPath),
    ]);

    const result = RenderResultSchema.parse({
      outputPath,
      durationSec: probe.durationSec,
      sizeBytes: stat.size,
      width: probe.width,
      height: probe.height,
      codec: probe.codec,
      renderMs: Date.now() - started,
    });

    log("render.done", {
      ms: result.renderMs,
      sizeBytes: result.sizeBytes,
      durationSec: result.durationSec,
    });

    return result;
  } finally {
    await fs.rm(scratch, { recursive: true, force: true }).catch(() => {
      // best-effort cleanup
    });
  }
}
