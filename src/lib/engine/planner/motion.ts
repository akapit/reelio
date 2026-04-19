import type {
  AspectRatio,
  ImageMetadata,
  MotionSpec,
  MotionType,
  TemplateSlot,
} from "@/lib/engine/models";

/**
 * Signed delta (image AR vs target AR, normalized by target) at which we
 * consider a source image "materially mismatched" to the target frame and
 * start biasing motion to reveal more of the source.
 *
 *   delta > 0  →  image wider than target (e.g. 16:9 source into 9:16 frame)
 *   delta < 0  →  image taller than target (e.g. 3:4 source into 16:9 frame)
 */
const AR_BIAS_THRESHOLD = 0.2;

function resolveMotionType(
  slot: TemplateSlot,
  image: ImageMetadata,
  targetAspectRatio: number,
): MotionType {
  const motion: MotionType = slot.defaultMotion;
  const imageAR = image.dims.aspectRatio;
  const delta = (imageAR - targetAspectRatio) / targetAspectRatio;

  // Image much wider than the target frame → a horizontal pan reveals more of
  // the image than a static/center-zoom crop. Keep the slot's preferred pan
  // direction if it already has one; otherwise default to pan_right.
  if (delta > AR_BIAS_THRESHOLD) {
    if (motion === "pan_left" || motion === "pan_right") return motion;
    return "pan_right";
  }

  // Image much taller than the target frame → pull-back reveals the vertical
  // extent better than a zoom-in or pan. ken_burns_out starts zoomed and
  // widens, which minimizes the top/bottom crop early in the shot.
  if (delta < -AR_BIAS_THRESHOLD) {
    if (motion === "ken_burns_out") return motion;
    return "ken_burns_out";
  }

  return motion;
}

function specFor(motion: MotionType): MotionSpec {
  switch (motion) {
    case "ken_burns_in":
      return {
        type: motion,
        startScale: 1.0,
        endScale: 1.25,
        startXPct: 0.5,
        endXPct: 0.5,
        startYPct: 0.5,
        endYPct: 0.5,
      };
    case "ken_burns_out":
      return {
        type: motion,
        startScale: 1.3,
        endScale: 1.05,
        startXPct: 0.5,
        endXPct: 0.5,
        startYPct: 0.5,
        endYPct: 0.5,
      };
    case "pan_left":
      return {
        type: motion,
        startScale: 1.1,
        endScale: 1.1,
        startXPct: 0.2,
        endXPct: 0.0,
        startYPct: 0.5,
        endYPct: 0.5,
      };
    case "pan_right":
      return {
        type: motion,
        startScale: 1.1,
        endScale: 1.1,
        startXPct: 0.0,
        endXPct: 0.2,
        startYPct: 0.5,
        endYPct: 0.5,
      };
    case "slow_zoom":
      return {
        type: motion,
        startScale: 1.0,
        endScale: 1.08,
        startXPct: 0.5,
        endXPct: 0.5,
        startYPct: 0.5,
        endYPct: 0.5,
      };
    case "static":
    default:
      return {
        type: "static",
        startScale: 1.0,
        endScale: 1.0,
        startXPct: 0.5,
        endXPct: 0.5,
        startYPct: 0.5,
        endYPct: 0.5,
      };
  }
}

/** Legacy export used by buildTimeline (old pipeline). */
export function assign(
  slot: TemplateSlot,
  image: ImageMetadata,
  targetAspectRatio: number,
): MotionSpec {
  const motion = resolveMotionType(slot, image, targetAspectRatio);
  return specFor(motion);
}

// ---------------------------------------------------------------------------
// New scene-based pipeline helpers
// ---------------------------------------------------------------------------

function targetARValue(ar: AspectRatio): number {
  switch (ar) {
    case "16:9":
      return 16 / 9;
    case "9:16":
      return 9 / 16;
    case "1:1":
      return 1;
  }
}

/**
 * Returns a short English motion-intent string describing the intended camera
 * movement for a scene. Used by the scene-based planner; fed downstream to
 * Claude's cinematography prompt writer.
 *
 * Rules:
 * - Base on `slot.defaultMotion`.
 * - If image is materially wider than target (AR delta > threshold) → bias
 *   toward horizontal pan (reveals more image width).
 * - If image is materially taller than target (AR delta < -threshold) → bias
 *   toward vertical reveal / ken-burns upward.
 * - Static slots → "static hold with subtle push-in".
 */
export function describeMotionIntent(args: {
  slot: TemplateSlot;
  imageDims: { width: number; height: number; aspectRatio: number };
  targetAspectRatio: AspectRatio;
}): string {
  const { slot, imageDims, targetAspectRatio } = args;
  const targetAR = targetARValue(targetAspectRatio);
  const delta = (imageDims.aspectRatio - targetAR) / targetAR;

  // Static slots always hold.
  if (slot.defaultMotion === "static") {
    return "static hold with subtle push-in";
  }

  // Image much wider than target → horizontal pan to reveal panoramic content.
  if (delta > AR_BIAS_THRESHOLD) {
    if (slot.defaultMotion === "pan_left") {
      return "gentle pan-left reveal";
    }
    return "gentle pan-right reveal";
  }

  // Image much taller than target → vertical reveal suits portrait content.
  if (delta < -AR_BIAS_THRESHOLD) {
    return "ken-burns upward reveal";
  }

  // No significant AR mismatch — use the slot's default motion intent.
  switch (slot.defaultMotion) {
    case "ken_burns_in":
      return "slow dolly-in toward the center";
    case "ken_burns_out":
      return "slow pull-back from the center";
    case "pan_left":
      return "gentle pan-left reveal";
    case "pan_right":
      return "gentle pan-right reveal";
    case "slow_zoom":
      return "slow creeping zoom-in";
    default:
      return "static hold with subtle push-in";
  }
}

export { AR_BIAS_THRESHOLD };
