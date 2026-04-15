import {
  ImageDataset,
  ImageMetadata,
  ShotPlan,
  Template,
  TemplateSlot,
  TimelineBlueprint,
  TransitionType,
} from "@/lib/engine/models";
import { distribute, type DurationChoice } from "./duration";
import { InsufficientImages } from "./fallback";
import { assign as assignMotion } from "./motion";
import { pickImage } from "./selection";

export { InsufficientImages, PlannerAbort } from "./fallback";

const QUALITY_FLOOR = 0.4;

type Choice = {
  slot: TemplateSlot;
  image: ImageMetadata;
  fallbackApplied: string | null;
};

function logPlanner(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ source: "planner", event, ...data }));
}

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

function transitionDuration(t: TransitionType): number {
  if (t === "cut") return 0;
  if (t === "flash") return 0.2;
  return 0.5;
}

export function buildTimeline(
  dataset: ImageDataset,
  template: Template,
): TimelineBlueprint | { abortedSlotIds: string[] } {
  if (dataset.usableCount < template.minUsableImages) {
    logPlanner("insufficientImages", {
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

    // No direct pick — consult onMissing.
    switch (slot.onMissing) {
      case "use_hero": {
        const hero = heroFallback(dataset, used, slot.allowReuse);
        if (hero) {
          if (!slot.allowReuse) used.add(hero.path);
          choices.push({ slot, image: hero, fallbackApplied: "hero_fallback" });
          logPlanner("fallbackApplied", {
            slotId: slot.id,
            fallback: "hero_fallback",
          });
        } else {
          unfilled.push(slot.id);
          logPlanner("slotUnfilled", { slotId: slot.id, reason: "no_hero_available" });
        }
        break;
      }
      case "use_wow": {
        const wow = wowFallback(dataset, used, slot.allowReuse);
        if (wow) {
          if (!slot.allowReuse) used.add(wow.path);
          choices.push({ slot, image: wow, fallbackApplied: "wow_fallback" });
          logPlanner("fallbackApplied", {
            slotId: slot.id,
            fallback: "wow_fallback",
          });
        } else {
          unfilled.push(slot.id);
          logPlanner("slotUnfilled", { slotId: slot.id, reason: "no_wow_available" });
        }
        break;
      }
      case "skip":
        unfilled.push(slot.id);
        logPlanner("slotSkipped", { slotId: slot.id });
        break;
      case "abort":
        aborts.push(slot.id);
        logPlanner("slotAbort", { slotId: slot.id });
        break;
      default:
        unfilled.push(slot.id);
        break;
    }
  }

  if (aborts.length > 0) {
    logPlanner("plannerAborted", { abortedSlotIds: aborts });
    return { abortedSlotIds: aborts };
  }

  if (choices.length === 0) {
    // Nothing picked at all — treat as abort so callers don't build a bad timeline.
    // NOTE: spec didn't enumerate this edge case; surfacing all slot ids as aborted
    // is safer than throwing a zod parse error on empty `shots`.
    return { abortedSlotIds: template.slots.map((s) => s.id) };
  }

  const durationInputs: DurationChoice[] = choices.map((c) => ({
    slot: c.slot,
    image: c.image,
  }));
  const durations = distribute(durationInputs, template.targetDurationSec);

  const shots: ShotPlan[] = choices.map((c, idx) => {
    const durationSec = durations[idx];
    const motion = assignMotion(c.slot, c.image);
    return {
      slotId: c.slot.id,
      order: idx,
      imagePath: c.image.path,
      imageRoomType: c.image.roomType,
      durationSec,
      motion,
      transitionOut: c.slot.transitionOut,
      transitionDurationSec: transitionDuration(c.slot.transitionOut),
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

  logPlanner("timelineBuilt", {
    templateName: template.name,
    shotCount: shots.length,
    total,
    unfilledCount: unfilled.length,
    warnings,
  });

  return TimelineBlueprint.parse(blueprint);
}
