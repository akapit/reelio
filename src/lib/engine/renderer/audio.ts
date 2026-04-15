import { promises as fs } from "node:fs";
import path from "node:path";

import type { TimelineBlueprint } from "@/lib/engine/models";

import { FfmpegError } from "./errors";

export class MusicNotFoundError extends FfmpegError {
  constructor(msg: string, stderrTail?: string) {
    super(msg, stderrTail);
    this.name = "MusicNotFoundError";
  }
}

function fmt(n: number): string {
  const rounded = Math.round(n * 1_000_000) / 1_000_000;
  return rounded.toString();
}

export function buildAudioTrack(timeline: TimelineBlueprint): {
  musicPath: string;
  filter: string;
} {
  const cwd = process.cwd();
  const dir =
    process.env.ENGINE_MUSIC_DIR ??
    path.join(cwd, "src/lib/engine/assets/music");
  const musicPath = path.join(dir, `${timeline.music.mood}.mp3`);

  const total = timeline.totalDurationSec;
  const volume = timeline.music.volume;
  const fadeOutStart = total - 0.5;

  const filter = `volume=${fmt(volume)},afade=t=in:st=0:d=0.5,afade=t=out:st=${fmt(fadeOutStart)}:d=0.5`;

  return { musicPath, filter };
}

export async function ensureMusicExists(musicPath: string): Promise<void> {
  try {
    await fs.access(musicPath);
  } catch {
    throw new MusicNotFoundError(
      `Music file not found at ${musicPath}. Set ENGINE_MUSIC_DIR or add the mp3.`,
    );
  }
}
