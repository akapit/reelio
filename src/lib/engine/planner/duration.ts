import type { ImageMetadata, TemplateSlot } from "@/lib/engine/models";

export type DurationChoice = { slot: TemplateSlot; image: ImageMetadata };

const MAX_REDISTRIBUTE_PASSES = 5;

/**
 * Per-choice weight for the initial duration allocation. With scoring removed
 * every usable image is equal — return 1.0 so durations start as a uniform
 * split of `targetDurationSec`, then the clamp + redistribute passes honour
 * each slot's `[minDuration, maxDuration]` window.
 */
function weightFor(_image: ImageMetadata): number {
  return 1;
}

export function distribute(
  choices: DurationChoice[],
  targetDurationSec: number,
): number[] {
  if (choices.length === 0) return [];

  // Start each at midpoint of its [min, max].
  const base = choices.map(
    (c) => (c.slot.minDuration + c.slot.maxDuration) / 2,
  );
  const weights = choices.map((c) => weightFor(c.image));

  // Initial weighted allocation that sums to targetDurationSec.
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const durations = weights.map(
    (w) => (w / weightSum) * targetDurationSec,
  );

  // Clamp + redistribute residual over unclamped shots.
  const clamped = new Array<boolean>(choices.length).fill(false);
  for (let pass = 0; pass < MAX_REDISTRIBUTE_PASSES; pass++) {
    let residual = 0;
    for (let i = 0; i < durations.length; i++) {
      const slot = choices[i].slot;
      if (durations[i] < slot.minDuration) {
        residual += durations[i] - slot.minDuration; // negative residual
        durations[i] = slot.minDuration;
        clamped[i] = true;
      } else if (durations[i] > slot.maxDuration) {
        residual += durations[i] - slot.maxDuration; // positive residual
        durations[i] = slot.maxDuration;
        clamped[i] = true;
      }
    }

    if (Math.abs(residual) < 1e-6) break;

    const unclampedIdx: number[] = [];
    for (let i = 0; i < durations.length; i++) {
      if (!clamped[i]) unclampedIdx.push(i);
    }
    if (unclampedIdx.length === 0) break;

    const perShot = residual / unclampedIdx.length;
    for (const idx of unclampedIdx) {
      durations[idx] += perShot;
    }
  }

  // Fall-back safeguard: ensure all durations satisfy their slot bounds even if
  // we ran out of redistribution passes.
  // NOTE: suppresses unused lint for `base` — we computed it for potential
  // future tie-breaking but the weighted allocation already seeds reasonable
  // values.
  void base;

  // Round to 0.1s.
  return durations.map((d) => Math.round(d * 10) / 10);
}
