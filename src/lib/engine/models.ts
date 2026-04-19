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

/**
 * Normalized bounding box (each field ∈ [0, 1] of the source image).
 * x0/y0 = top-left; x1/y1 = bottom-right.
 */
export const BoundingBox = z.object({
  x0: z.number().min(0).max(1),
  y0: z.number().min(0).max(1),
  x1: z.number().min(0).max(1),
  y1: z.number().min(0).max(1),
});
export type BoundingBox = z.infer<typeof BoundingBox>;

/** A localized object detected by Google Vision with its bounding box. */
export const VisionObject = z.object({
  name: z.string(),
  confidence: z.number(),
  bbox: BoundingBox,
});
export type VisionObject = z.infer<typeof VisionObject>;

export const ImageMetadata = z.object({
  path: z.string(),
  roomType: RoomType,
  /** Binary quality gate from Claude VLM. When false, the image is excluded
   *  from the timeline and surfaced in the UI pre-flight panel. */
  usable: z.boolean().default(true),
  /** One-line human-readable reason when !usable (e.g. "blurry", "watermark"). */
  reason: z.string().optional(),
  dims: ImageDims,
  visionLabels: z.array(VisionLabel).default([]),
  /**
   * Localized objects with normalized bboxes, used downstream by smartCrop
   * to center the 9:16 crop on the dominant subject(s). Defaults to [].
   */
  visionObjects: z.array(VisionObject).default([]),
  /** @deprecated no longer consumed; retained as optional for historical rows
   *  in engine_runs.summary. Not populated for new runs. */
  scores: ImageScores.optional(),
  /** @deprecated same as scores — retained for historical rows only. */
  eligibility: ImageEligibility.optional(),
  /** @deprecated — the prompt writer no longer uses colour palette context. */
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
  // New-pipeline timeline (scene-based). Old TimelineBlueprint is deprecated.
  timeline: z.lazy(() => SceneTimeline),
  dataset: ImageDataset,
  render: RenderResult,
  totalMs: z.number().int().nonnegative(),
  runId: z.string().uuid().optional(),
  scenePrompts: z.array(z.lazy(() => ScenePrompt)).optional(),
  sceneVideos: z.array(z.lazy(() => SceneVideo)).optional(),
});
export type JobResult = z.infer<typeof JobResult> & {
  timeline: SceneTimeline;
  scenePrompts?: ScenePrompt[];
  sceneVideos?: SceneVideo[];
};

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

/**
 * Nominal slot count per template. Used by the UI pre-flight helper to show
 * "X images for a template that uses Y slots → Z scenes" before the user hits
 * generate. Kept in sync with the JSON files in `src/lib/engine/templates/*`.
 */
export const TEMPLATE_SLOT_COUNTS: Record<TemplateName, number> = {
  luxury_30s: 8,
  family_30s: 8,
  fast_15s: 6,
  investor_20s: 6,
  premium_45s: 10,
};

// --- New scene-based pipeline models ---------------------------------------

export const SceneRole = z.enum(["opening", "hero", "wow", "filler", "closing"]);
export type SceneRole = z.infer<typeof SceneRole>;

export const VideoModelChoice = z.enum(["kling", "seedance", "seedance-fast"]);
export type VideoModelChoice = z.infer<typeof VideoModelChoice>;

/**
 * Resolve the server-side default video model. Applied as a hard override to
 * every scene when the request did not come with a user-selected model.
 * Falls back to "kling" — the most conservative choice for interior motion.
 * The env var also lets us A/B kling vs seedance without a deploy.
 */
export function resolveDefaultVideoModel(): VideoModelChoice {
  const raw = process.env.ENGINE_DEFAULT_MODEL;
  if (raw === "kling" || raw === "seedance" || raw === "seedance-fast") {
    return raw;
  }
  return "kling";
}

/** One planned scene. Produced by the planner, consumed by the prompt writer. */
export const Scene = z.object({
  sceneId: z.string(),
  order: z.number().int().nonnegative(),
  slotId: z.string(),
  imagePath: z.string(),
  imageRoomType: RoomType,
  /** @deprecated the writer no longer reads scores. Optional for back-compat. */
  imageScores: ImageScores.optional(),
  /** @deprecated no longer consumed by the writer. */
  imageDominantColorsHex: z.array(z.string()).default([]),
  /** Top few labels from GCV (compact signal for the writer). */
  imageLabels: z.array(VisionLabel).default([]),
  sceneRole: SceneRole,
  durationSec: z.number().positive(),
  motionIntent: z.string(),
  templateMood: z.string(),
  overlayText: z.string().nullable().default(null),
  transitionOut: TransitionType,
  transitionDurationSec: z.number().min(0).default(0.3),
});
export type Scene = z.infer<typeof Scene>;

/** Produced by Claude per scene and fed to the scene generator. */
export const ScenePrompt = z.object({
  sceneId: z.string(),
  prompt: z.string().min(1),
  modelChoice: VideoModelChoice.default("kling"),
  modelReason: z.string().optional(),
  modelParams: z
    .object({
      mode: z.enum(["std", "pro"]).optional(),
      cameraMovement: z.string().optional(),
    })
    .optional(),
});
export type ScenePrompt = z.infer<typeof ScenePrompt>;

export const PreparedSceneCrop = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  noop: z.boolean(),
  reason: z.string(),
});
export type PreparedSceneCrop = z.infer<typeof PreparedSceneCrop>;

export const PreparedSceneSource = z.object({
  originalImagePath: z.string(),
  providerImageUrl: z.string(),
  sourceLocalPath: z.string().nullable().optional(),
  preparedLocalPath: z.string().nullable().optional(),
  uploadedPreparedUrl: z.string().nullable().optional(),
  localizedFromRemote: z.boolean().default(false),
  crop: PreparedSceneCrop.nullable().optional(),
});
export type PreparedSceneSource = z.infer<typeof PreparedSceneSource>;

export const SceneQualityEvaluation = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  summary: z.string(),
  issues: z.array(z.string()).default([]),
  retryPrompt: z.string().nullable().default(null),
  retryReason: z.string().nullable().default(null),
  fallbackUsed: z.boolean().default(false),
  anthropicRequestId: z.string().nullable().optional(),
  tokensIn: z.number().nullable().optional(),
  tokensOut: z.number().nullable().optional(),
  cacheReadTokens: z.number().nullable().optional(),
  cacheWriteTokens: z.number().nullable().optional(),
  /** Estimated USD cost of the Anthropic evaluator call (0 when fallback). */
  costUsd: z.number().nullable().optional(),
});
export type SceneQualityEvaluation = z.infer<typeof SceneQualityEvaluation>;

/** Produced by the per-scene generator (piapi). */
export const SceneVideo = z.object({
  sceneId: z.string(),
  videoUrl: z.string().url(),
  piapiTaskId: z.string().optional(),
  durationSec: z.number().positive().optional(),
  model: z.string(),
  generationMs: z.number().int().nonnegative().optional(),
  attemptOrder: z.number().int().positive().optional(),
  prompt: ScenePrompt.optional(),
  preparedSource: PreparedSceneSource.optional(),
  evaluation: SceneQualityEvaluation.optional(),
});
export type SceneVideo = z.infer<typeof SceneVideo>;

/** Full scene-based timeline returned by the planner. */
export const SceneTimeline = z.object({
  templateName: z.string(),
  targetDurationSec: z.number().positive(),
  totalDurationSec: z.number().positive(),
  aspectRatio: AspectRatio,
  resolution: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  fps: z.number().int().positive(),
  scenes: z.array(Scene).min(1),
  music: z.object({ mood: z.string(), volume: z.number() }),
  overlays: TemplateOverlays,
  unfilledSlotIds: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type SceneTimeline = z.infer<typeof SceneTimeline>;

// --- Supabase tracking row shapes -----------------------------------------

export const RunStatus = z.enum(["pending", "running", "done", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const StepStatus = z.enum(["running", "done", "failed"]);
export type StepStatus = z.infer<typeof StepStatus>;

export const StepType = z.enum([
  "vision_analyze",
  "plan",
  "scene_prompt",
  "scene_generate",
  "scene_evaluate",
  "voiceover",
  "music",
  "merge",
  "upload",
  "finalize_asset",
]);
export type StepType = z.infer<typeof StepType>;

export const SceneRecordStatus = z.enum(["pending", "running", "done", "failed"]);
export type SceneRecordStatus = z.infer<typeof SceneRecordStatus>;

export const SceneAttemptStatus = z.enum(["running", "done", "failed"]);
export type SceneAttemptStatus = z.infer<typeof SceneAttemptStatus>;

export const EventLevel = z.enum(["info", "warn", "error"]);
export type EventLevel = z.infer<typeof EventLevel>;

/** engine_runs row (subset we care about in app code). */
export const RunRecord = z.object({
  id: z.string().uuid(),
  asset_id: z.string().uuid(),
  user_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  status: RunStatus,
  input: z.record(z.unknown()),
  summary: z.record(z.unknown()),
  error: z.record(z.unknown()).nullable(),
});
export type RunRecord = z.infer<typeof RunRecord>;

/** engine_steps row (subset we write). */
export const StepRecord = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  step_order: z.number().int().nonnegative(),
  step_type: StepType,
  status: StepStatus,
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  external_ids: z.record(z.unknown()),
  metrics: z.record(z.unknown()),
  error: z.record(z.unknown()).nullable(),
});
export type StepRecord = z.infer<typeof StepRecord>;

export const EngineSceneRecord = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  scene_id: z.string(),
  scene_order: z.number().int().nonnegative(),
  slot_id: z.string(),
  status: SceneRecordStatus,
  image_path: z.string(),
  room_type: z.string(),
  scene_role: z.string(),
  duration_sec: z.number(),
  motion_intent: z.string().nullable().optional(),
  overlay_text: z.string().nullable().optional(),
  transition_out: z.string().nullable().optional(),
  transition_duration_sec: z.number().nullable().optional(),
  planner: z.record(z.unknown()),
  prompt: z.record(z.unknown()),
  output: z.record(z.unknown()),
  error: z.record(z.unknown()).nullable(),
});
export type EngineSceneRecord = z.infer<typeof EngineSceneRecord>;

export const EngineSceneAttemptRecord = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  scene_record_id: z.string().uuid(),
  attempt_order: z.number().int().positive(),
  status: SceneAttemptStatus,
  provider: z.string().nullable().optional(),
  model_choice: z.string().nullable().optional(),
  prompt: z.record(z.unknown()),
  external_ids: z.record(z.unknown()),
  metrics: z.record(z.unknown()),
  output: z.record(z.unknown()),
  error: z.record(z.unknown()).nullable(),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
});
export type EngineSceneAttemptRecord = z.infer<typeof EngineSceneAttemptRecord>;

export const EngineEventRecord = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  scene_record_id: z.string().uuid().nullable().optional(),
  attempt_id: z.string().uuid().nullable().optional(),
  level: EventLevel,
  event_type: z.string(),
  payload: z.record(z.unknown()),
  created_at: z.string().datetime(),
});
export type EngineEventRecord = z.infer<typeof EngineEventRecord>;
