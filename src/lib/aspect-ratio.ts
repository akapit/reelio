/**
 * Aspect-ratio bucketing + conflict detection.
 *
 * Used at three points:
 *   - Upload time, browser-side: persist `metadata.dimensions.label` next to
 *     the raw width/height/ratio so we can warn before generation without
 *     re-decoding the image.
 *   - Server-side lazy backfill (`asset-dimensions.ts`): same fields for assets
 *     uploaded before the upload-time tagging shipped.
 *   - Pre-flight check (`/api/assets/check-aspect-ratio`): compare each source
 *     image's bucket against the chosen template's output AR.
 *
 * Pure module — no Node / Next.js / browser deps so it loads in every layer.
 */

export const ASPECT_RATIO_LABELS = ["16:9", "9:16", "4:3", "1:1"] as const;
export type AspectRatioLabel = (typeof ASPECT_RATIO_LABELS)[number];

/** Output ARs the engine can target today. Mirrors `AspectRatio` zod enum in
 *  `src/lib/engine/models.ts` — kept as a runtime-friendly subset because the
 *  bucketing helper produces one extra label (`4:3`) that the engine will
 *  never *render* but that we still want to detect on input. */
export type TargetAspectRatio = "16:9" | "9:16" | "1:1";

/**
 * Bucket a raw width/height into one of four labels.
 *
 * Thresholds chosen so the common camera/phone ratios bucket correctly without
 * tripping false positives between near-cousins (e.g. 16:9 ≈ 1.78 and 1.55 are
 * both "landscape", they shouldn't fight each other):
 *
 *   ratio >= 1.5            → "16:9"  (1.78, 1.55, 1.50)
 *   1.18 <= ratio < 1.5     → "4:3"   (1.33, classic SLR; treated as compatible
 *                                       with 16:9 — both are landscape)
 *   0.85 <= ratio < 1.18    → "1:1"   (square; treated as compatible with all)
 *   ratio < 0.85            → "9:16"  (0.5625 phone portrait, 0.75 etc.)
 *
 * Falls back to "1:1" for non-finite or zero-height inputs.
 */
export function getAspectRatioLabel(
  width: number,
  height: number,
): AspectRatioLabel {
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return "1:1";
  }
  const ratio = width / height;
  if (ratio >= 1.5) return "16:9";
  if (ratio >= 1.18) return "4:3";
  if (ratio >= 0.85) return "1:1";
  return "9:16";
}

/**
 * Returns true when source and target buckets are visually incompatible — i.e.
 * one is portrait and the other is landscape. `1:1` (square) is treated as
 * universally compatible to avoid noisy warnings on near-square crops.
 *
 * The mismatch the user actually cares about is portrait-vs-landscape; 4:3
 * inside a 16:9 template gets a small letterbox / center crop that doesn't
 * cut off the subject, so we don't warn there.
 */
export function aspectRatiosConflict(
  source: AspectRatioLabel,
  target: TargetAspectRatio,
): boolean {
  if (source === "1:1" || target === "1:1") return false;
  const sourceIsPortrait = source === "9:16";
  const targetIsPortrait = target === "9:16";
  return sourceIsPortrait !== targetIsPortrait;
}

/**
 * Coarse orientation classification — useful for warning copy ("the following
 * images are portrait" vs "landscape"). Mirrors the bucket but collapses 16:9
 * and 4:3 into "landscape".
 */
export function aspectRatioOrientation(
  label: AspectRatioLabel,
): "landscape" | "portrait" | "square" {
  if (label === "9:16") return "portrait";
  if (label === "1:1") return "square";
  return "landscape";
}
