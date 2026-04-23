import type { ShotPlan, TransitionType } from "@/lib/engine/models";

type TransitionShot = Pick<ShotPlan, "transitionOut" | "durationSec">;

export interface BuildConcatGraphOptions {
  /**
   * When set, every input clip is pre-normalized to this size (and fps, if
   * provided) before being fed into the xfade chain. Required whenever the
   * inputs might differ in dimensions — xfade errors out with "First input
   * link main parameters (size AxB) do not match the corresponding second
   * input link xfade parameters (size CxD)" if any pair mismatches.
   *
   * Kling 2.5 Turbo usually returns 1920x1080 but occasionally emits a
   * slightly different size (e.g. 1928x1072) depending on how it interprets
   * the source aspect ratio — this is the lever that handles it.
   */
  target?: { width: number; height: number; fps?: number };
}

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
  options: BuildConcatGraphOptions = {},
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
  const { target } = options;

  // When a target size is supplied, emit a per-input normalization filter so
  // every xfade sees two identically-sized streams. `increase` + `crop`
  // up-scales the input to exceed the target in at least one axis, then
  // crops centered to fit — avoids letterbox bars that `decrease` + `pad`
  // would produce on tiny dimension drifts (1928×1072 → 1920×1080 is a
  // ~0.4% crop, imperceptible).
  const normalizeSegments: string[] = [];
  const sourceLabel = (i: number): string =>
    target ? `[v${i}]` : `[${i}:v]`;
  if (target) {
    const { width: W, height: H, fps } = target;
    const fpsFilter = fps ? `,fps=${fps}` : "";
    for (let i = 0; i < n; i++) {
      normalizeSegments.push(
        `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1${fpsFilter}[v${i}]`,
      );
    }
  }

  if (n === 1) {
    // Single clip: just relabel to [vout] via a null filter. If we were asked
    // to normalize, still do it so callers get a uniform output size.
    const head = sourceLabel(0);
    const tail = `${head}null[vout]`;
    const filter = target ? [...normalizeSegments, tail].join(";") : tail;
    return { args, filter };
  }

  const segments: string[] = [...normalizeSegments];
  let cumulative = 0;
  let priorOverlap = 0;
  let prevLabel = sourceLabel(0);

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
    // Intermediate labels are suffixed with every merged input's index so
    // they never collide with the per-input `[v0]`, `[v1]`, ... labels used
    // when `target` normalization is active (those are all single-digit).
    const outLabel = isLast
      ? "[vout]"
      : `[v${Array.from({ length: i + 2 }, (_, k) => k).join("")}]`;
    segments.push(
      `${prevLabel}${sourceLabel(i + 1)}xfade=transition=${transition}:duration=${fmt(duration)}:offset=${fmt(offset)}${outLabel}`,
    );
    prevLabel = outLabel;
  }

  return { args, filter: segments.join(";") };
}
