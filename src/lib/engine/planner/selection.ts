import type {
  ImageDataset,
  ImageMetadata,
  TemplateSlot,
} from "@/lib/engine/models";

const QUALITY_FLOOR = 0.4;

type SlotIntent = "hero" | "wow" | "interior";

function slotIntent(slot: TemplateSlot): SlotIntent {
  if (slot.requiredRoomType === "exterior" || slot.id.includes("closing")) {
    return "hero";
  }
  if (slot.requiredRoomType === null && slot.onMissing === "use_wow") {
    return "wow";
  }
  return "interior";
}

function scoreForIntent(image: ImageMetadata, intent: SlotIntent): number {
  const { quality, composition, lighting, wow, hero } = image.scores;
  switch (intent) {
    case "hero":
      return 0.6 * hero + 0.3 * quality + 0.1 * wow;
    case "wow":
      return 0.7 * wow + 0.2 * quality + 0.1 * composition;
    case "interior":
    default:
      return 0.5 * quality + 0.3 * composition + 0.2 * lighting;
  }
}

function matchesRoomType(
  image: ImageMetadata,
  required: TemplateSlot["requiredRoomType"],
): boolean {
  if (required === null) return true;
  return image.roomType === required;
}

function topRanked(
  candidates: ImageMetadata[],
  intent: SlotIntent,
): ImageMetadata | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = scoreForIntent(best, intent);
  for (let i = 1; i < candidates.length; i++) {
    const s = scoreForIntent(candidates[i], intent);
    if (s > bestScore) {
      best = candidates[i];
      bestScore = s;
    }
  }
  return best;
}

export function pickImage(
  slot: TemplateSlot,
  dataset: ImageDataset,
  used: Set<string>,
): ImageMetadata | null {
  // NOTE: allowReuse means this slot may re-pick an already-used image, so we
  // skip the `used` filter for such slots. The caller still decides whether
  // to mark the pick as used on the way out.
  const baseCandidates = dataset.images.filter(
    (img) =>
      (slot.allowReuse || !used.has(img.path)) &&
      img.scores.quality >= QUALITY_FLOOR,
  );

  const intent = slotIntent(slot);

  // Required room type filter, with fallback room types if required yields zero.
  let filtered: ImageMetadata[];
  if (slot.requiredRoomType === null) {
    filtered = baseCandidates;
  } else {
    filtered = baseCandidates.filter((img) =>
      matchesRoomType(img, slot.requiredRoomType),
    );
    if (filtered.length === 0) {
      for (const fallback of slot.fallbackRoomTypes) {
        const next = baseCandidates.filter((img) => img.roomType === fallback);
        if (next.length > 0) {
          filtered = next;
          break;
        }
      }
    }
  }

  return topRanked(filtered, intent);
}
