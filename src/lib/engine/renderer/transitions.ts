import type { ShotPlan, TransitionType } from "@/lib/engine/models";

type TransitionShot = Pick<ShotPlan, "transitionOut" | "durationSec">;

function xfadeParams(t: TransitionType): {
  transition: string;
  duration: number;
} {
  switch (t) {
    case "cut":
      // ffmpeg's xfade with duration=0 truncates the output to the first clip.
      // Use a single-frame crossfade (~1/30s at 30fps) — visually an instant cut
      // but keeps the xfade chain well-formed across ffmpeg versions.
      return { transition: "fade", duration: 0.04 };
    case "fade":
      return { transition: "fade", duration: 0.5 };
    case "flash":
      return { transition: "fadewhite", duration: 0.2 };
    case "dip_to_white":
      return { transition: "fadewhite", duration: 0.5 };
    default: {
      const exhaustive: never = t;
      throw new Error(`Unknown transition: ${String(exhaustive)}`);
    }
  }
}

function fmt(n: number): string {
  // Trim trailing zeros while avoiding scientific notation and keeping ints clean.
  const rounded = Math.round(n * 1_000_000) / 1_000_000;
  const s = rounded.toString();
  return s;
}

export function buildConcatGraph(
  clipPaths: string[],
  shots: TransitionShot[],
): { args: string[]; filter: string } {
  if (clipPaths.length === 0) {
    throw new Error("buildConcatGraph: clipPaths must be non-empty");
  }
  if (clipPaths.length !== shots.length) {
    throw new Error(
      `buildConcatGraph: clipPaths (${clipPaths.length}) / shots (${shots.length}) length mismatch`,
    );
  }

  const args: string[] = [];
  for (const p of clipPaths) {
    args.push("-i", p);
  }

  const n = clipPaths.length;

  if (n === 1) {
    // Single clip: just relabel to [vout] via a null filter.
    return { args, filter: "[0:v]null[vout]" };
  }

  const segments: string[] = [];
  let cumulative = 0;
  let priorOverlap = 0;
  let prevLabel = "[0:v]";

  for (let i = 0; i < n - 1; i++) {
    const shot = shots[i];
    const { transition, duration } = xfadeParams(shot.transitionOut);
    cumulative += shot.durationSec;
    // Each prior xfade consumed `duration` seconds of overlap in the merged
    // stream, so the next xfade's offset (relative to the merged stream) must
    // subtract those — otherwise ffmpeg silently drops the second input.
    const offset = cumulative - priorOverlap - duration;
    priorOverlap += duration;
    const isLast = i === n - 2;
    const outLabel = isLast
      ? "[vout]"
      : `[v${Array.from({ length: i + 2 }, (_, k) => k).join("")}]`;
    segments.push(
      `${prevLabel}[${i + 1}:v]xfade=transition=${transition}:duration=${fmt(duration)}:offset=${fmt(offset)}${outLabel}`,
    );
    prevLabel = outLabel;
  }

  return { args, filter: segments.join(";") };
}
