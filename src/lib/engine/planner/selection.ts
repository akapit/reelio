import type {
  ImageDataset,
  ImageMetadata,
  TemplateSlot,
} from "@/lib/engine/models";

/**
 * Result of a pick attempt.
 *
 * `matchTier` tells the caller *why* the pick succeeded, so they can emit
 * the right warning / recommendation event:
 *   - "exact"    — roomType matched the slot's requiredRoomType
 *   - "fallback" — roomType matched one of slot.fallbackRoomTypes
 *   - "relaxed"  — no room-type match; we returned any unused image so the
 *                  user's photo doesn't go to waste. Emits a recommendation
 *                  ("upload a photo of X next time for best results").
 *   - "reused"   — only applies when slot.allowReuse; same image picked
 *                  again because no unused image was available.
 */
export type PickTier = "exact" | "fallback" | "relaxed" | "reused";

export interface PickResult {
  image: ImageMetadata;
  tier: PickTier;
}

/**
 * Pick an image for a template slot, never returning null when any usable
 * image exists in the dataset.
 *
 * Policy (product decision 2026-04-19): **never exclude an uploaded image**.
 * If the user uploaded 7 pictures, they want a 7-scene video. If a slot
 * can't find a room-type match we relax to "any unused usable image" rather
 * than leaving the slot unfilled and letting an image sit unused. We still
 * surface the room-type mismatch to the run's warnings so the UI can
 * recommend "upload a bathroom photo next time".
 *
 * Selection is unused-preferring: image diversity is valued, so even when
 * `slot.allowReuse=true` we try unused images first and only reuse as a
 * last resort. This prevents the "closing slot re-picks the hero image
 * while a bedroom photo sits unused" failure mode.
 *
 * Tier order (first match wins):
 *   1. UNUSED + exact required room type             → tier "exact"
 *   2. UNUSED + any declared fallback room type      → tier "fallback"
 *   3. UNUSED + any other room type (relaxed match)  → tier "relaxed"
 *   4. If slot.allowReuse: USED + exact              → tier "reused"
 *   5. If slot.allowReuse: USED + any room type      → tier "reused"
 *   6. null — only reachable when the dataset has zero usable images OR
 *             the slot disallows reuse AND every image is already used.
 *
 * When `slot.requiredRoomType === null`, tiers 1–3 collapse to "any unused
 * usable image" and the returned tier is "exact" (the slot is permissive
 * by design, so no mismatch to report).
 */
export function pickImage(
  slot: TemplateSlot,
  dataset: ImageDataset,
  used: Set<string>,
): ImageMetadata | null {
  return pickImageDetailed(slot, dataset, used)?.image ?? null;
}

/**
 * Richer variant that returns the tier the match came from, so the planner
 * can attach the right recommendation warning when a relaxed match fires.
 */
export function pickImageDetailed(
  slot: TemplateSlot,
  dataset: ImageDataset,
  used: Set<string>,
): PickResult | null {
  const usable = dataset.images.filter((img) => img.usable);
  if (usable.length === 0) return null;

  const unused = usable.filter((img) => !used.has(img.path));
  const usedPool = usable.filter((img) => used.has(img.path));

  // Required-room-type === null: any usable image matches. Prefer unused.
  if (slot.requiredRoomType === null) {
    if (unused.length > 0) return { image: unused[0], tier: "exact" };
    if (slot.allowReuse && usedPool.length > 0)
      return { image: usedPool[0], tier: "reused" };
    return null;
  }

  // Tier 1: unused + exact room type.
  const unusedExact = unused.filter(
    (img) => img.roomType === slot.requiredRoomType,
  );
  if (unusedExact.length > 0) return { image: unusedExact[0], tier: "exact" };

  // Tier 2: unused + fallback room type (in declared order).
  for (const fallback of slot.fallbackRoomTypes) {
    const match = unused.filter((img) => img.roomType === fallback);
    if (match.length > 0) return { image: match[0], tier: "fallback" };
  }

  // Tier 3: UNUSED + any other room type (relaxed). Prefers image-diversity
  // over a perfect room-type fit — an unused living-room photo is better
  // than "no scene at all" for this slot. Caller logs this as a
  // recommendation to upload a matching photo next time.
  if (unused.length > 0) return { image: unused[0], tier: "relaxed" };

  // Reuse tiers — only if the slot explicitly allows reuse.
  if (slot.allowReuse) {
    const usedExact = usedPool.filter(
      (img) => img.roomType === slot.requiredRoomType,
    );
    if (usedExact.length > 0) return { image: usedExact[0], tier: "reused" };

    for (const fallback of slot.fallbackRoomTypes) {
      const match = usedPool.filter((img) => img.roomType === fallback);
      if (match.length > 0) return { image: match[0], tier: "reused" };
    }

    // Any reused image beats skipping the scene entirely.
    if (usedPool.length > 0) return { image: usedPool[0], tier: "reused" };
  }

  // Genuinely unfillable (caller may still apply `onMissing`).
  return null;
}
