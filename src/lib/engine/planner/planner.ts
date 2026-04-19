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
import { pickImage, pickImageDetailed, type PickTier } from "./selection";

export { InsufficientImages, PlannerAbort } from "./fallback";

// ---------------------------------------------------------------------------
// Shared internal types
// ---------------------------------------------------------------------------

type Choice = {
  slot: TemplateSlot;
  image: ImageMetadata;
  fallbackApplied: string | null;
  /** How the image ended up attached to this slot. "relaxed" means the
   *  room-type constraint had to be dropped to avoid leaving the image
   *  unused; the planner emits a recommendation warning so the UI can
   *  tell the user what to upload next time. Optional for backwards
   *  compatibility with the legacy `buildTimeline` caller. */
  matchTier?: PickTier;
};

/**
 * Room types that matter enough to surface as a recommendation when
 * missing. Chosen to match what a listing agent would typically want
 * captured but some users skip. Keep in sync with the roomClassifier's
 * output categories in src/lib/engine/vision/roomClassifier.ts.
 */
const RECOMMENDABLE_ROOM_TYPES = new Set<string>([
  "kitchen",
  "bedroom",
  "bathroom",
  "exterior",
  "balcony",
  "dining",
]);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * `onMissing: "use_hero"` fallback. Fires when `pickImage` couldn't satisfy
 * the slot's required room type. Same unused-preferring tier order as
 * `pickImage`:
 *   1. UNUSED exterior image
 *   2. UNUSED any usable image (first in dataset order)
 *   3. If allowReuse: USED exterior
 *   4. If allowReuse: USED any
 * Returns null if nothing matches.
 *
 * Key fix: the old version took `pool[0]` even when that image was already
 * used elsewhere, so `1_exterior` and `6_closing` would both grab the same
 * photo while bedroom/kitchen shots sat unused.
 */
function heroFallback(
  dataset: ImageDataset,
  used: Set<string>,
  allowReuse: boolean,
): ImageMetadata | null {
  const usable = dataset.images.filter((img) => img.usable);
  if (usable.length === 0) return null;

  const unused = usable.filter((img) => !used.has(img.path));
  const usedPool = usable.filter((img) => used.has(img.path));

  const unusedExterior = unused.find((img) => img.roomType === "exterior");
  if (unusedExterior) return unusedExterior;
  if (unused.length > 0) return unused[0];

  if (allowReuse) {
    const usedExterior = usedPool.find((img) => img.roomType === "exterior");
    if (usedExterior) return usedExterior;
    if (usedPool.length > 0) return usedPool[0];
  }
  return null;
}

/**
 * `onMissing: "use_wow"` fallback. Same tiering as heroFallback but biased
 * toward balcony/exterior/dining as "wow" candidates.
 */
function wowFallback(
  dataset: ImageDataset,
  used: Set<string>,
  allowReuse: boolean,
): ImageMetadata | null {
  const usable = dataset.images.filter((img) => img.usable);
  if (usable.length === 0) return null;

  const unused = usable.filter((img) => !used.has(img.path));
  const usedPool = usable.filter((img) => used.has(img.path));

  const preferred = ["balcony", "exterior", "dining"] as const;

  for (const type of preferred) {
    const match = unused.find((img) => img.roomType === type);
    if (match) return match;
  }
  if (unused.length > 0) return unused[0];

  if (allowReuse) {
    for (const type of preferred) {
      const match = usedPool.find((img) => img.roomType === type);
      if (match) return match;
    }
    if (usedPool.length > 0) return usedPool[0];
  }
  return null;
}

/**
 * Fill slots from the dataset, returning the filled choices and any abort/skip
 * lists. Shared by both buildTimeline and planTimeline.
 */
function fillSlots(
  dataset: ImageDataset,
  template: Template,
  logFn: (event: string, data?: Record<string, unknown>) => void,
): {
  choices: Choice[];
  unfilled: string[];
  aborts: string[];
  used: Set<string>;
} {
  const used = new Set<string>();
  const choices: Choice[] = [];
  const unfilled: string[] = [];
  const aborts: string[] = [];

  for (const slot of template.slots) {
    const pickResult = pickImageDetailed(slot, dataset, used);
    if (pickResult) {
      const picked = pickResult.image;
      if (!slot.allowReuse) used.add(picked.path);
      choices.push({
        slot,
        image: picked,
        fallbackApplied:
          pickResult.tier === "fallback"
            ? "room_fallback"
            : pickResult.tier === "relaxed"
              ? "room_relaxed"
              : pickResult.tier === "reused"
                ? "reused"
                : null,
        matchTier: pickResult.tier,
      });
      logFn("plan.slotFilled", {
        slotId: slot.id,
        imagePath: picked.path,
        tier: pickResult.tier,
        pickedRoomType: picked.roomType,
        requiredRoomType: slot.requiredRoomType,
      });
      continue;
    }

    // pickImageDetailed returns null ONLY when there are truly no usable
    // images left (or the slot disallows reuse AND every image is already
    // used). The onMissing branches below are retained for defensive
    // coverage — in practice they rarely fire now that the "relaxed" tier
    // accepts any unused image regardless of room type.
    switch (slot.onMissing) {
      case "use_hero": {
        const hero = heroFallback(dataset, used, slot.allowReuse);
        if (hero) {
          if (!slot.allowReuse) used.add(hero.path);
          choices.push({
            slot,
            image: hero,
            fallbackApplied: "hero_fallback",
            matchTier: "fallback",
          });
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
          choices.push({
            slot,
            image: wow,
            fallbackApplied: "wow_fallback",
            matchTier: "fallback",
          });
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

  return { choices, unfilled, aborts, used };
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

  // Slot trim: if we have fewer usable images than slots, shrink the
  // timeline to match. Keeps each scene on a unique image (no silent reuse).
  // Preserves the first slot (opening) and the last slot (closing) as
  // bookends; drops from the middle. Total duration shrinks
  // proportionally via the existing `distribute()` redistribution.
  let slotsTrimmed: {
    from: number;
    to: number;
    droppedSlotIds: string[];
  } | null = null;
  const budget = dataset.usableCount;
  if (budget < template.slots.length) {
    const originalSlots = template.slots;
    const originalCount = originalSlots.length;
    const kept: TemplateSlot[] = [];
    if (budget >= 1) kept.push(originalSlots[0]);
    const middle = originalSlots.slice(1, originalCount - 1);
    const middleBudget = Math.max(0, budget - 2); // reserve 1 for opening + 1 for closing
    if (middleBudget > 0) kept.push(...middle.slice(0, middleBudget));
    if (budget >= 2) kept.push(originalSlots[originalCount - 1]);
    // Edge case: budget === 1. Only keep the opening (most important establish
    // shot). The closing would otherwise overwrite it.
    const finalSlots = budget === 1 ? [originalSlots[0]] : kept;
    const droppedSlotIds = originalSlots
      .filter((s) => !finalSlots.some((k) => k.id === s.id))
      .map((s) => s.id);
    template = { ...template, slots: finalSlots };
    slotsTrimmed = {
      from: originalCount,
      to: finalSlots.length,
      droppedSlotIds,
    };
    logPlanner("plan.slotsTrimmed", {
      templateName: template.name,
      fromCount: originalCount,
      toCount: finalSlots.length,
      usableCount: budget,
      droppedSlotIds,
    });
  }

  logPlanner("plan.start", {
    templateName: template.name,
    imageCount: dataset.images.length,
    usableCount: dataset.usableCount,
    slotCount: template.slots.length,
    trimmed: slotsTrimmed !== null,
  });

  const { choices, unfilled, aborts, used } = fillSlots(
    dataset,
    template,
    logPlanner,
  );

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

  // Extras pass: when the user uploaded MORE usable images than the
  // template has slots, append the leftovers as synthetic filler scenes.
  // This enforces the "never exclude an uploaded image" product policy —
  // every photo the user attached becomes a scene, even if the template
  // wasn't sized for them. Extras are spliced BEFORE the closing slot so
  // the video still ends on the closing beat.
  //
  // IMPORTANT: we key the "unused" filter on the set of actually-picked
  // image paths (from `choices`), NOT on `used`. `used` only tracks paths
  // for slots where `allowReuse=false`; luxury_30s's closing slot has
  // `allowReuse=true` (so other slots may borrow the closing image), which
  // means its picked image never lands in `used` and would otherwise get
  // double-counted as "unused" here. The picked-paths set reflects the
  // ground truth: "these images already have a scene attached to them".
  const pickedPaths = new Set(choices.map((c) => c.image.path));
  const extraImages = dataset.images.filter(
    (img) => img.usable && !pickedPaths.has(img.path),
  );
  if (extraImages.length > 0) {
    const closingIdx = choices.length - 1;
    const closingChoice = choices[closingIdx];
    // Drop the closing; we'll re-append after inserting extras.
    const body = choices.slice(0, closingIdx);
    for (let i = 0; i < extraImages.length; i++) {
      const img = extraImages[i];
      const syntheticSlot: TemplateSlot = {
        id: `extra_${i + 1}_${img.roomType}`,
        label: `Extra ${img.roomType}`,
        requiredRoomType: null, // accept anything
        fallbackRoomTypes: [],
        onMissing: "skip",
        minDuration: 3,
        maxDuration: 5,
        defaultMotion: "ken_burns_in",
        transitionOut: "cut",
        allowReuse: false,
        overlayText: null,
      };
      body.push({
        slot: syntheticSlot,
        image: img,
        fallbackApplied: "extras_pass",
        matchTier: "exact",
      });
      used.add(img.path);
    }
    // Re-append closing so the last scene remains semantically "closing".
    body.push(closingChoice);
    choices.length = 0;
    choices.push(...body);
    logPlanner("plan.extrasAppended", {
      templateName: template.name,
      extraCount: extraImages.length,
      totalScenes: choices.length,
    });
  }

  const durationInputs: DurationChoice[] = choices.map((c) => ({
    slot: c.slot,
    image: c.image,
  }));
  const durations = distribute(durationInputs, template.targetDurationSec);

  const warnings: string[] = [];
  if (slotsTrimmed) {
    warnings.push(
      `slots_trimmed:${slotsTrimmed.from}->${slotsTrimmed.to}:images=${budget}`,
    );
  }
  if (extraImages.length > 0) {
    warnings.push(
      `extras_appended:${extraImages.length}:images=${dataset.usableCount}:templateSlots=${template.slots.length}`,
    );
  }

  // Per-slot relaxation warnings + aggregate recommendations.
  // Goal: never silently paper over a room-type miss. Every slot that was
  // filled with a relaxed (wrong-room-type) pick shows up in the inspector
  // as "slot X wanted bathroom, got living — consider uploading a bathroom
  // photo next time".
  const relaxedSlots = choices.filter((c) => c.matchTier === "relaxed");
  for (const c of relaxedSlots) {
    if (!c.slot.requiredRoomType) continue;
    warnings.push(
      `room_relaxed:${c.slot.id}:wanted=${c.slot.requiredRoomType}:got=${c.image.roomType}`,
    );
  }
  // Collect the DISTINCT room types the template asked for but we couldn't
  // satisfy. Only recommendable types surface (bathroom/bedroom/kitchen
  // etc.) — no point suggesting the user upload a "filler" photo.
  const missingRoomTypes = new Set<string>();
  for (const c of relaxedSlots) {
    const wanted = c.slot.requiredRoomType;
    if (wanted && RECOMMENDABLE_ROOM_TYPES.has(wanted)) {
      // Confirm it's actually missing from the dataset (vs. already consumed
      // by a different slot — in that case a second copy wouldn't help).
      const haveAny = dataset.images.some(
        (img) => img.usable && img.roomType === wanted,
      );
      if (!haveAny) missingRoomTypes.add(wanted);
    }
  }
  for (const room of missingRoomTypes) {
    warnings.push(`recommend_upload:${room}`);
  }
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
      // `imageScores` is deprecated and now optional — omit entirely.
      // `imageDominantColorsHex` is still required on the output type (via
      // Zod `.default([])`), so pass an empty array.
      imageDominantColorsHex: [],
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
