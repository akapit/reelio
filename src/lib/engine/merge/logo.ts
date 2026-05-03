import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runFfmpeg, runFfprobe } from "@/lib/engine/renderer/ffmpegRun";
import {
  normalizeLogoPlacement,
  type VideoLogoRenderOptions,
} from "@/lib/video-logo";

function fmtSeconds(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function cornerExpression(position: string, margin: number): { x: string; y: string } {
  switch (position) {
    case "top-left":
      return { x: String(margin), y: String(margin) };
    case "bottom-left":
      return { x: String(margin), y: `main_h-overlay_h-${margin}` };
    case "bottom-right":
      return {
        x: `main_w-overlay_w-${margin}`,
        y: `main_h-overlay_h-${margin}`,
      };
    case "top-right":
    default:
      return { x: `main_w-overlay_w-${margin}`, y: String(margin) };
  }
}

async function downloadLogo(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`logo download failed: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fsp.writeFile(outputPath, Buffer.from(arrayBuffer));
}

export async function applyLogoToVideoFile(options: {
  inputPath: string;
  outputPath: string;
  logo: VideoLogoRenderOptions;
  tmpDir?: string;
}): Promise<void> {
  const placement = normalizeLogoPlacement(options.logo.placement);
  if (!placement.corner && !placement.endCard) {
    await fsp.copyFile(options.inputPath, options.outputPath);
    return;
  }

  const scratch = await fsp.mkdtemp(
    path.join(options.tmpDir ?? os.tmpdir(), "engine-logo-"),
  );
  const logoPath = path.join(scratch, "logo");
  try {
    await downloadLogo(options.logo.url, logoPath);
    const probe = await runFfprobe(options.inputPath);
    const width = probe.width;
    const height = probe.height;
    const margin = Math.max(18, Math.round(width * 0.02));
    const cornerWidth = Math.max(96, Math.round(width * 0.14));
    const cardWidth = Math.max(240, Math.round(width * 0.32));
    const filterSegments: string[] = [];
    const args = ["-y", "-i", options.inputPath, "-i", logoPath];

    if (placement.endCard) {
      args.push(
        "-f",
        "lavfi",
        "-t",
        fmtSeconds(placement.endCardDurationSec ?? 3),
        "-i",
        `color=c=0x111111:s=${width}x${height}:r=30`,
      );
    }

    let mainLabel = "[0:v]";
    if (placement.corner) {
      const { x, y } = cornerExpression(
        placement.cornerPosition ?? "top-right",
        margin,
      );
      filterSegments.push(
        `[1:v]format=rgba,scale=${cornerWidth}:-2[corner_logo]`,
        `[0:v][corner_logo]overlay=x=${x}:y=${y}:format=auto[main_logo]`,
      );
      mainLabel = "[main_logo]";
    }

    if (placement.endCard) {
      filterSegments.push(
        `${mainLabel}fps=30,setsar=1,setpts=PTS-STARTPTS[main]`,
        `[1:v]format=rgba,scale=${cardWidth}:-2[card_logo]`,
        `[2:v]setsar=1[card_base]`,
        `[card_base][card_logo]overlay=x=(W-w)/2:y=(H-h)/2:format=auto[card]`,
        `[main][card]concat=n=2:v=1:a=0[vout]`,
      );
    } else {
      filterSegments.push(`${mainLabel}null[vout]`);
    }

    await runFfmpeg([
      ...args,
      "-filter_complex",
      filterSegments.join(";"),
      "-map",
      "[vout]",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      options.outputPath,
    ]);
  } finally {
    await fsp.rm(scratch, { recursive: true, force: true });
  }
}

export async function applyLogoToVideoBuffer(options: {
  videoBuffer: Buffer;
  logo: VideoLogoRenderOptions;
}): Promise<Buffer> {
  const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), "engine-logo-buffer-"));
  const inputPath = path.join(scratch, "input.mp4");
  const outputPath = path.join(scratch, "output.mp4");
  try {
    await fsp.writeFile(inputPath, options.videoBuffer);
    await applyLogoToVideoFile({
      inputPath,
      outputPath,
      logo: options.logo,
      tmpDir: scratch,
    });
    return await fsp.readFile(outputPath);
  } finally {
    await fsp.rm(scratch, { recursive: true, force: true });
  }
}
