import type {
  ImageMetadata,
  MotionSpec,
  MotionType,
  TemplateSlot,
} from "@/lib/engine/models";

function resolveMotionType(
  slot: TemplateSlot,
  image: ImageMetadata,
): MotionType {
  let motion: MotionType = slot.defaultMotion;
  const ar = image.dims.aspectRatio;

  if (ar > 1.6 && motion === "slow_zoom") {
    motion = "pan_right";
  }
  if (ar < 1.0) {
    motion = "slow_zoom";
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

export function assign(slot: TemplateSlot, image: ImageMetadata): MotionSpec {
  const motion = resolveMotionType(slot, image);
  return specFor(motion);
}
