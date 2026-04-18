import {
  ImageDataset,
  ImageMetadata,
  Scene,
  SceneRole,
  SceneTimeline,
  ShotPlan,
  Template,
  TemplateSlot,
  TimelineBlueprint,
  TransitionType,
  VisionLabel,
} from "@/lib/engine/models";
import { distribute, type DurationChoice } from "./duration";
import { InsufficientImages } from "./fallback";
import { assign as assignMotion, AR_BIAS_THRESHOLD, describeMotionIntent } from "./motion";
import { pickImage } from "./selection";

export { InsufficientImages, PlannerAbort } from "./fallback";

const QUALITY_FLOOR = 0.4;

// ---------------------------------------------------------------------------
// Shared internal types
// ---------------------------------------------------------------------------

type Choice = {
  slot: TemplateSlot;
  image: ImageMetadata;
  fallbackApplied: string | null;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function heroFallback(
  dataset: ImageDataset,
  used: Set<string>,
  allowReuse: boolean,
): ImageMetadata | null {
  const candidates = dataset.images.filter(
    (img) =>
      (allowReuse || !used.has(img.path)) && img.scores.quality >= QUALITY_FLOOR,
  );
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    if (
      c.scores.hero > best.scores.hero ||
      (c.scores.hero === best.scores.hero && c.scores.quality > best.scores.quality)
    ) {
      best = c;
    }
  }
  return best;
}

function wowFallback(
  dataset: ImageDataset,
  used: Set<string>,
  allowReuse: boolean,
): ImageMetadata | null {
  const candidates = dataset.images.filter(
    (img) =>
      (allowReuse || !used.has(img.path)) && img.scores.quality >= QUALITY_FLOOR,
  );
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].scores.wow > best.scores.wow) {
      best = candidates[i];
    }
  }
  return best;
}

/**
 * Fill slots from the dataset, returning the filled choices and any abort/skip
 * lists. Shared by both buildTimeline and planTimeline.
 */
function fillSlots(
  dataset: ImageDataset,
  template: Template,
  logFn: (event: string, data?: Record<string, unknown>) => void,
): { choices: Choice[]; unfilled: string[]; aborts: string[] } {
  const used = new Set<string>();
  const choices: Choice[] = [];
  const unfilled: string[] = [];
  const aborts: string[] = [];

  for (const slot of template.slots) {
    const picked = pickImage(slot, dataset, used);
    if (picked) {
      if (!slot.allowReuse) used.add(picked.path);
      choices.push({ slot, image: picked, fallbackApplied: null });
      logFn("plan.slotFilled", { slotId: slot.id, imagePath: picked.path });
      continue;
    }

    // No direct pick — consult onMissing.
    switch (slot.onMissing) {
      case "use_hero": {
        const hero = heroFallback(dataset, used, slot.allowReuse);
        if (hero) {
          if (!slot.allowReuse) used.add(hero.path);
          choices.push({ slot, image: hero, fallbackApplied: "hero_fallback" });
          logFn("plan.slotFilled", {
            slotId: slot.id,
            imagePath: hero.path,
            fallback: "hero_fallback",
          });
        } else {
          unfilled.push(slot.id);
          logFn("plan.slotSkipped", { slotId: slot.id, reason: "no_hero_available" });
        }
        break;
      }
      case "use_wow": {
        const wow = wowFallback(dataset, used, slot.allowReuse);
        if (wow) {
          if (!slot.allowReuse) used.add(wow.path);
          choices.push({ slot, image: wow, fallbackApplied: "wow_fallback" });
          logFn("plan.slotFilled", {
            slotId: slot.id,
            imagePath: wow.path,
            fallback: "wow_fallback",
          });
        } else {
          unfilled.push(slot.id);
          logFn("plan.slotSkipped", { slotId: slot.id, reason: "no_wow_available" });
        }
        break;
      }
      case "skip":
        unfilled.push(slot.id);
        logFn("plan.slotSkipped", { slotId: slot.id });
        break;
      case "abort":
        aborts.push(slot.id);
        logFn("plan.slotAborted", { slotId: slot.id });
        break;
      default:
        unfilled.push(slot.id);
        break;
    }
  }

  return { choices, unfilled, aborts };
}

// ---------------------------------------------------------------------------
// Legacy transition duration (used by buildTimeline / old pipeline)
// ---------------------------------------------------------------------------

function transitionDurationLegacy(t: TransitionType): number {
  if (t === "cut") return 0;
  if (t === "flash") return 0.2;
  return 0.5;
}

// ---------------------------------------------------------------------------
// Legacy planner (old pipeline — keep intact for tools.ts / tests)
// ---------------------------------------------------------------------------

function logPlannerLegacy(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ source: "planner", event, ...data }));
}

export function buildTimeline(
  dataset: ImageDataset,
  template: Template,
): TimelineBlueprint | { abortedSlotIds: string[] } {
  if (dataset.usableCount < template.minUsableImages) {
    logPlannerLegacy("insufficientImages", {
      have: dataset.usableCount,
      need: template.minUsableImages,
    });
    throw new InsufficientImages(
      dataset.usableCount,
      template.minUsableImages,
    );
  }

  const used = new Set<string>();
  const choices: Choice[] = [];
  const unfilled: string[] = [];
  const aborts: string[] = [];

  for (const slot of template.slots) {
    const picked = pickImage(slot, dataset, used);
    if (picked) {
      if (!slot.allowReuse) used.add(picked.path);
      choices.push({ slot, image: picked, fallbackApplied: null });
      continue;
    }

    switch (slot.onMissing) {
      case "use_hero": {
        const hero = heroFallback(dataset, used, slot.allowReuse);
        if (hero) {
          if (!slot.allowReuse) used.add(hero.path);
          choices.push({ slot, image: hero, fallbackApplied: "hero_fallback" });
          logPlannerLegacy("fallbackApplied", {
            slotId: slot.id,
            fallback: "hero_fallback",
          });
        } else {
          unfilled.push(slot.id);
          logPlannerLegacy("slotUnfilled", { slotId: slot.id, reason: "no_hero_available" });
        }
        break;
      }
      case "use_wow": {
        const wow = wowFallback(dataset, used, slot.allowReuse);
        if (wow) {
          if (!slot.allowReuse) used.add(wow.path);
          choices.push({ slot, image: wow, fallbackApplied: "wow_fallback" });
          logPlannerLegacy("fallbackApplied", {
            slotId: slot.id,
            fallback: "wow_fallback",
          });
        } else {
          unfilled.push(slot.id);
          logPlannerLegacy("slotUnfilled", { slotId: slot.id, reason: "no_wow_available" });
        }
        break;
      }
      case "skip":
        unfilled.push(slot.id);
        logPlannerLegacy("slotSkipped", { slotId: slot.id });
        break;
      case "abort":
        aborts.push(slot.id);
        logPlannerLegacy("slotAbort", { slotId: slot.id });
        break;
      default:
        unfilled.push(slot.id);
        break;
    }
  }

  if (aborts.length > 0) {
    logPlannerLegacy("plannerAborted", { abortedSlotIds: aborts });
    return { abortedSlotIds: aborts };
  }

  if (choices.length === 0) {
    return { abortedSlotIds: template.slots.map((s) => s.id) };
  }

  const durationInputs: DurationChoice[] = choices.map((c) => ({
    slot: c.slot,
    image: c.image,
  }));
  const durations = distribute(durationInputs, template.targetDurationSec);

  const targetAR = template.resolution.width / template.resolution.height;
  const arMismatches: Array<{ slotId: string; deltaPct: number; orientation: string }> = [];

  const shots: ShotPlan[] = choices.map((c, idx) => {
    const durationSec = durations[idx];
    const motion = assignMotion(c.slot, c.image, targetAR);
    const imageAR = c.image.dims.aspectRatio;
    const delta = (imageAR - targetAR) / targetAR;
    if (Math.abs(delta) >= AR_BIAS_THRESHOLD) {
      const orientation =
        delta > 0 ? "image_wider_than_target" : "image_taller_than_target";
      arMismatches.push({
        slotId: c.slot.id,
        deltaPct: Math.round(delta * 100),
        orientation,
      });
      logPlannerLegacy("arMismatchBiased", {
        slotId: c.slot.id,
        imageAR: Number(imageAR.toFixed(3)),
        targetAR: Number(targetAR.toFixed(3)),
        deltaPct: Math.round(delta * 100),
        motionChosen: motion.type,
        orientation,
      });
    }
    return {
      slotId: c.slot.id,
      order: idx,
      imagePath: c.image.path,
      imageRoomType: c.image.roomType,
      durationSec,
      motion,
      transitionOut: c.slot.transitionOut,
      transitionDurationSec: transitionDurationLegacy(c.slot.transitionOut),
      overlayText: c.slot.overlayText ?? null,
      fallbackApplied: c.fallbackApplied,
    };
  });

  const total = shots.reduce((s, x) => s + x.durationSec, 0);
  const warnings: string[] = [];
  const delta = total - template.targetDurationSec;
  if (Math.abs(delta) > 2) {
    warnings.push(`duration_off_by_${delta.toFixed(1)}s`);
  }
  for (const m of arMismatches) {
    warnings.push(`ar_mismatch:${m.slotId}:${m.deltaPct >= 0 ? "+" : ""}${m.deltaPct}%:${m.orientation}`);
  }

  const blueprint = {
    templateName: template.name,
    targetDurationSec: template.targetDurationSec,
    totalDurationSec: total,
    aspectRatio: template.aspectRatio,
    resolution: template.resolution,
    fps: template.fps,
    shots,
    music: template.music,
    overlays: template.overlays,
    unfilledSlotIds: unfilled,
    warnings,
  };

  logPlannerLegacy("timelineBuilt", {
    templateName: template.name,
    shotCount: shots.length,
    total,
    unfilledCount: unfilled.length,
    warnings,
  });

  return TimelineBlueprint.parse(blueprint);
}

// ---------------------------------------------------------------------------
// New scene-based planner
// ---------------------------------------------------------------------------

export interface PlanTimelineInput {
  dataset: ImageDataset;
  template: Template;
}

export interface PlanTimelineResult {
  timeline: SceneTimeline;
  abortedSlotIds?: string[];
}

function logPlanner(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ source: "engine.planner", event, ...data }));
}

/**
 * Map a template name prefix to a one-line mood string. Falls back to the
 * template's music.mood if no prefix matches.
 */
function templateMoodFor(templateName: string, musicMood: string): string {
  if (templateName.startsWith("luxury")) return "elegant, unhurried, premium";
  if (templateName.startsWith("family")) return "warm, inviting, natural";
  if (templateName.startsWith("fast")) return "energetic, punchy, crisp";
  if (templateName.startsWith("investor")) return "clean, clear, informative";
  if (templateName.startsWith("premium")) return "cinematic, refined, atmospheric";
  return musicMood;
}

/**
 * Determine the SceneRole for a scene from its slot and its position in the
 * final sequence.
 *
 * Precedence (highest wins):
 *   1. Last scene → "closing"
 *   2. Slot id/label contains "hero" → "hero"
 *   3. Slot id/label contains "wow" → "wow"
 *   4. First scene (order=0) with slot id containing "opening"/"exterior" → "opening"
 *   5. Everything else → "filler"
 */
function resolveSceneRole(
  slot: TemplateSlot,
  order: number,
  isLast: boolean,
): SceneRole {
  if (isLast) return "closing";

  const combined = `${slot.id} ${slot.label}`.toLowerCase();
  if (combined.includes("hero")) return "hero";
  if (combined.includes("wow")) return "wow";
  if (
    order === 0 &&
    (combined.includes("opening") || combined.includes("exterior"))
  ) {
    return "opening";
  }
  return "filler";
}

/**
 * Transition duration for the new scene pipeline.
 *
 * cut          → 0.04 s  (near-instantaneous; single-frame dissolve)
 * flash        → 0.2 s
 * fade         → 0.3 s
 * dip_to_white → 0.3 s
 */
function sceneTransitionDuration(t: TransitionType): number {
  if (t === "cut") return 0.04;
  if (t === "flash") return 0.2;
  return 0.3;
}

/**
 * Derive a stable scene id from slot id and the image basename.
 */
function makeSceneId(slotId: string, imagePath: string, order: number): string {
  const basename = imagePath.split("/").pop()?.split(".")[0] ?? `img${order}`;
  return `scene_${slotId}_${basename}`;
}

/**
 * Plan a SceneTimeline from an ImageDataset and a Template.
 *
 * Returns `{ timeline }` on success or `{ abortedSlotIds }` when one or more
 * required slots could not be filled (same abort semantics as buildTimeline).
 *
 * Graceful degradation: when `usableCount < template.minUsableImages` (but
 * `> 0`), the template is cloned in-memory with `allowReuse=true` on every
 * slot so the same image can fill multiple scenes. A warning is emitted into
 * the final blueprint. Only throws `InsufficientImages` when ZERO usable
 * images exist — that's genuinely unrecoverable.
 */
export function planTimeline(input: PlanTimelineInput): PlanTimelineResult {
  const { dataset } = input;
  let { template } = input;

  if (dataset.usableCount === 0) {
    logPlanner("plan.start", {
      templateName: template.name,
      usableCount: 0,
      outcome: "no_usable_images",
    });
    throw new InsufficientImages(0, template.minUsableImages);
  }

  // Soft floor: when we're under the template's nominal minUsableImages,
  // auto-enable image reuse and proceed with a warning. Better than a 500 at
  // the API layer. The downstream effect is that some images may appear in
  // multiple scenes (different motions/prompts per scene still differentiate
  // them), which is preferable to no video at all.
  const lowImageCount = dataset.usableCount < template.minUsableImages;
  const lowImageWarning = lowImageCount
    ? `low_image_count:${dataset.usableCount}/${template.minUsableImages}:auto_reuse_enabled`
    : null;
  if (lowImageCount) {
    template = {
      ...template,
      slots: template.slots.map((s) => ({ ...s, allowReuse: true })),
    };
    logPlanner("plan.autoReuseEnabled", {
      templateName: template.name,
      usableCount: dataset.usableCount,
      minUsableImages: input.template.minUsableImages,
    });
  }

  logPlanner("plan.start", {
    templateName: template.name,
    imageCount: dataset.images.length,
    usableCount: dataset.usableCount,
    slotCount: template.slots.length,
    lowImageCount,
  });

  const { choices, unfilled, aborts } = fillSlots(dataset, template, logPlanner);

  if (aborts.length > 0) {
    logPlanner("plan.done", {
      templateName: template.name,
      outcome: "aborted",
      abortedSlotIds: aborts,
    });
    return { timeline: undefined as unknown as SceneTimeline, abortedSlotIds: aborts };
  }

  if (choices.length === 0) {
    const allSlotIds = template.slots.map((s) => s.id);
    logPlanner("plan.done", {
      templateName: template.name,
      outcome: "aborted",
      abortedSlotIds: allSlotIds,
    });
    return { timeline: undefined as unknown as SceneTimeline, abortedSlotIds: allSlotIds };
  }

  const durationInputs: DurationChoice[] = choices.map((c) => ({
    slot: c.slot,
    image: c.image,
  }));
  const durations = distribute(durationInputs, template.targetDurationSec);

  const warnings: string[] = [];
  if (lowImageWarning) warnings.push(lowImageWarning);
  const mood = templateMoodFor(template.name, template.music.mood);
  const lastIndex = choices.length - 1;

  const scenes: Scene[] = choices.map((c, idx) => {
    const durationSec = durations[idx];
    const isLast = idx === lastIndex;
    const sceneRole = resolveSceneRole(c.slot, idx, isLast);

    const motionIntent = describeMotionIntent({
      slot: c.slot,
      imageDims: c.image.dims,
      targetAspectRatio: template.aspectRatio,
    });

    // AR mismatch warning (informational).
    const targetARNum = template.resolution.width / template.resolution.height;
    const imageAR = c.image.dims.aspectRatio;
    const arDelta = (imageAR - targetARNum) / targetARNum;
    if (Math.abs(arDelta) >= AR_BIAS_THRESHOLD) {
      const orientation =
        arDelta > 0 ? "image_wider_than_target" : "image_taller_than_target";
      warnings.push(
        `ar_mismatch:${c.slot.id}:${arDelta >= 0 ? "+" : ""}${Math.round(arDelta * 100)}%:${orientation}`,
      );
    }

    // Top 5 vision labels by confidence.
    const topLabels: VisionLabel[] = [...c.image.visionLabels]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    const transitionOut = c.slot.transitionOut;
    const transitionDurationSec = sceneTransitionDuration(transitionOut);

    const scene: Scene = {
      sceneId: makeSceneId(c.slot.id, c.image.path, idx),
      order: idx,
      slotId: c.slot.id,
      imagePath: c.image.path,
      imageRoomType: c.image.roomType,
      imageScores: c.image.scores,
      imageDominantColorsHex: c.image.dominantColorsHex,
      imageLabels: topLabels,
      sceneRole,
      durationSec,
      motionIntent,
      templateMood: mood,
      overlayText: c.slot.overlayText ?? null,
      transitionOut,
      transitionDurationSec,
    };

    return Scene.parse(scene);
  });

  const total = scenes.reduce((s, x) => s + x.durationSec, 0);
  const durationDelta = total - template.targetDurationSec;
  if (Math.abs(durationDelta) > 2) {
    warnings.push(`duration_off_by_${durationDelta.toFixed(1)}s`);
  }

  const rawTimeline = {
    templateName: template.name,
    targetDurationSec: template.targetDurationSec,
    totalDurationSec: total,
    aspectRatio: template.aspectRatio,
    resolution: template.resolution,
    fps: template.fps,
    scenes,
    music: template.music,
    overlays: template.overlays,
    unfilledSlotIds: unfilled,
    warnings,
  };

  const timeline = SceneTimeline.parse(rawTimeline);

  logPlanner("plan.done", {
    templateName: template.name,
    outcome: "success",
    sceneCount: scenes.length,
    totalDurationSec: total,
    unfilledCount: unfilled.length,
    warnCount: warnings.length,
    warnings,
  });

  return { timeline };
}
