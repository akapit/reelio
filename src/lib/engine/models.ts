import { z } from "zod";

export const RoomType = z.enum([
  "exterior",
  "living",
  "kitchen",
  "bedroom",
  "bathroom",
  "dining",
  "balcony",
  "office",
  "hallway",
  "other",
]);
export type RoomType = z.infer<typeof RoomType>;

export const MotionType = z.enum([
  "ken_burns_in",
  "ken_burns_out",
  "pan_left",
  "pan_right",
  "static",
  "slow_zoom",
]);
export type MotionType = z.infer<typeof MotionType>;

export const TransitionType = z.enum(["cut", "fade", "flash", "dip_to_white"]);
export type TransitionType = z.infer<typeof TransitionType>;

export const OnMissing = z.enum(["use_hero", "use_wow", "skip", "abort"]);
export type OnMissing = z.infer<typeof OnMissing>;

export const AspectRatio = z.enum(["16:9", "9:16", "1:1"]);
export type AspectRatio = z.infer<typeof AspectRatio>;

export const ImageScores = z.object({
  quality: z.number().min(0).max(1),
  lighting: z.number().min(0).max(1),
  composition: z.number().min(0).max(1),
  wow: z.number().min(0).max(1),
  detail: z.number().min(0).max(1),
  hero: z.number().min(0).max(1),
});
export type ImageScores = z.infer<typeof ImageScores>;

export const ImageEligibility = z.object({
  asHero: z.boolean(),
  asWow: z.boolean(),
  asClosing: z.boolean(),
});
export type ImageEligibility = z.infer<typeof ImageEligibility>;

export const ImageDims = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspectRatio: z.number().positive(),
});
export type ImageDims = z.infer<typeof ImageDims>;

export const VisionLabel = z.object({
  name: z.string(),
  confidence: z.number(),
});
export type VisionLabel = z.infer<typeof VisionLabel>;

export const ImageMetadata = z.object({
  path: z.string(),
  roomType: RoomType,
  scores: ImageScores,
  eligibility: ImageEligibility,
  dims: ImageDims,
  visionLabels: z.array(VisionLabel).default([]),
  dominantColorsHex: z.array(z.string()).default([]),
});
export type ImageMetadata = z.infer<typeof ImageMetadata>;

export const ImageDataset = z.object({
  images: z.array(ImageMetadata),
  availableRoomTypes: z.array(RoomType),
  usableCount: z.number().int().min(0),
  analyzedAt: z.string().datetime(),
});
export type ImageDataset = z.infer<typeof ImageDataset>;

export const TemplateSlot = z.object({
  id: z.string(),
  label: z.string(),
  requiredRoomType: RoomType.nullable(),
  fallbackRoomTypes: z.array(RoomType).default([]),
  onMissing: OnMissing,
  minDuration: z.number().positive(),
  maxDuration: z.number().positive(),
  defaultMotion: MotionType,
  transitionOut: TransitionType,
  allowReuse: z.boolean().default(false),
  overlayText: z.string().nullable().default(null),
});
export type TemplateSlot = z.infer<typeof TemplateSlot>;

export const TemplateOverlays = z.object({
  headline: z.object({ enabled: z.boolean(), text: z.string().nullable() }),
  captions: z.object({ enabled: z.boolean() }),
  cta: z.object({ enabled: z.boolean(), text: z.string().nullable() }),
});
export type TemplateOverlays = z.infer<typeof TemplateOverlays>;

export const Template = z.object({
  name: z.string(),
  targetDurationSec: z.number().positive(),
  aspectRatio: AspectRatio,
  fps: z.number().int().positive(),
  resolution: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  minUsableImages: z.number().int().positive(),
  music: z.object({ mood: z.string(), volume: z.number().min(0).max(1) }),
  overlays: TemplateOverlays,
  slots: z.array(TemplateSlot).min(1),
});
export type Template = z.infer<typeof Template>;

export const MotionSpec = z.object({
  type: MotionType,
  startScale: z.number().positive(),
  endScale: z.number().positive(),
  startXPct: z.number(),
  endXPct: z.number(),
  startYPct: z.number(),
  endYPct: z.number(),
});
export type MotionSpec = z.infer<typeof MotionSpec>;

export const ShotPlan = z.object({
  slotId: z.string(),
  order: z.number().int().nonnegative(),
  imagePath: z.string(),
  imageRoomType: RoomType,
  durationSec: z.number().positive(),
  motion: MotionSpec,
  transitionOut: TransitionType,
  transitionDurationSec: z.number().min(0),
  overlayText: z.string().nullable(),
  fallbackApplied: z.string().nullable(),
});
export type ShotPlan = z.infer<typeof ShotPlan>;

export const TimelineBlueprint = z.object({
  templateName: z.string(),
  targetDurationSec: z.number().positive(),
  totalDurationSec: z.number().positive(),
  aspectRatio: AspectRatio,
  resolution: z.object({
    width: z.number(),
    height: z.number(),
  }),
  fps: z.number().int().positive(),
  shots: z.array(ShotPlan).min(1),
  music: z.object({ mood: z.string(), volume: z.number() }),
  overlays: TemplateOverlays,
  unfilledSlotIds: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type TimelineBlueprint = z.infer<typeof TimelineBlueprint>;

export const RenderResult = z.object({
  outputPath: z.string(),
  durationSec: z.number().positive(),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  codec: z.string(),
  renderMs: z.number().int().nonnegative(),
});
export type RenderResult = z.infer<typeof RenderResult>;

export const JobResult = z.object({
  status: z.literal("success"),
  videoPath: z.string(),
  timeline: TimelineBlueprint,
  dataset: ImageDataset,
  render: RenderResult,
  totalMs: z.number().int().nonnegative(),
});
export type JobResult = z.infer<typeof JobResult>;

export const FailureReason = z.enum([
  "insufficient_images",
  "vision_api_failure",
  "vision_output_invalid",
  "no_usable_template",
  "planner_slots_unfillable",
  "renderer_ffmpeg_failure",
  "timeout",
  "unknown",
]);
export type FailureReason = z.infer<typeof FailureReason>;

export const Layer = z.enum(["vision", "planner", "renderer", "orchestrator"]);
export type Layer = z.infer<typeof Layer>;

export const JobError = z.object({
  status: z.literal("error"),
  layer: Layer,
  reason: FailureReason,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type JobError = z.infer<typeof JobError>;

export const TEMPLATE_NAMES = [
  "luxury_30s",
  "family_30s",
  "fast_15s",
  "investor_20s",
  "premium_45s",
] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];
