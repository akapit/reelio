/**
 * Opening-scene prompt bank.
 *
 * Every video's first scene gets an attention-grabbing "whip-pan" style
 * entrance picked at random from this file. The base template (entry #1) was
 * the one the user verified produces strong Seedance output:
 *
 *   "[0s] Fast whip-pan reveal into the space shown in @Image1 — motion blur
 *    streaks across the frame as the camera bursts in, rapidly decelerating
 *    to a near-stop by the end of the first beat. Aggressive speed ramp:
 *    fast-to-slow."
 *
 * Each opener has a rich Seedance variant (1–2 sentences, descriptive) and a
 * terse Kling variant (<= 20 words, motion-only). The Seedance bank omits the
 * `@imageN` anchor because the scene-based engine sends one image per call
 * via Seedance's `first_frame_url` — reference-token anchoring only applies
 * when multiple images are bundled into a single `reference_image_urls`
 * request, which the engine does not do per-scene.
 */
import type { ScenePrompt as ScenePromptType } from "../models";

export interface WhipPanOpener {
  /** Rich prose for Seedance / Seedance-fast. */
  seedance: string;
  /** Terse single-sentence for Kling (<=20 words). */
  kling: string;
  /** modelParams.cameraMovement slug emitted alongside the prompt. */
  cameraMovement: string;
}

// Kling 2.5 image-to-video reliably interprets named standard-cinematography
// verbs ("lateral track", "dolly-in", "push-in", "snap-zoom") and honours
// explicit direction tokens ("right-to-left", "left-to-right"). It does NOT
// reliably interpret "whip-pan" from a still image — without a lateral anchor
// it defaults to a forward push-in (often reading as a zoom in/out). Every
// Kling variant below uses doc-recommended vocabulary, single-move shots,
// and an explicit motion endpoint ("settles to a stop"). The Seedance side
// is untouched — its translator handles the richer language well.
// See docs/market reference: Kling 2.5 Turbo prompt guide, single-move rule.
export const WHIP_PAN_OPENERS: readonly WhipPanOpener[] = [
  {
    seedance:
      "Fast whip-pan reveal into the space — motion blur streaks across the frame as the camera bursts in, rapidly decelerating to a near-stop by the end of the first beat. Aggressive speed ramp: fast-to-slow.",
    kling:
      "Fast lateral camera track right-to-left across the scene, motion blur streaking, decelerating to a decisive stop.",
    cameraMovement: "whip-pan",
  },
  {
    seedance:
      "Explosive snap-zoom into the scene, motion blur streaking inward as the camera rushes forward then slams to a near-halt. Pronounced fast-to-slow speed ramp on the first beat.",
    kling:
      "Explosive snap-zoom forward into the scene, streaking motion blur, settling hard to a near-stop.",
    cameraMovement: "snap-zoom",
  },
  {
    seedance:
      "Kinetic slam-dolly toward the interior — the image jitters briefly with streaking motion blur, then settles into a cinematic hold. Aggressive fast-to-slow speed ramp.",
    kling:
      "Quick dolly-in toward the scene, streaking motion blur, easing into a steady hold.",
    cameraMovement: "slam-dolly",
  },
  {
    seedance:
      "Rapid swoop-in on the scene, the camera hurtling forward with streaking motion blur before easing to a graceful near-stop. Pronounced fast-to-slow deceleration.",
    kling:
      "Rapid push-in toward the scene, streaking motion blur, easing to a confident stop.",
    cameraMovement: "swoop-in",
  },
  {
    seedance:
      "Hard whip-pan into the frame — the camera slices across the scene with streaking blur before decelerating to a confident near-stop. Pronounced speed ramp, fast-to-slow.",
    kling:
      "Sharp lateral tracking shot left-to-right, motion blur streaking the frame, settling into a confident halt.",
    cameraMovement: "whip-pan",
  },
];

/** Random picker. `rng` is injectable for deterministic tests. */
export function pickWhipPanOpener(
  rng: () => number = Math.random,
): WhipPanOpener {
  const idx = Math.floor(rng() * WHIP_PAN_OPENERS.length);
  return WHIP_PAN_OPENERS[Math.min(idx, WHIP_PAN_OPENERS.length - 1)];
}

/**
 * Build a `ScenePrompt` override for the opening scene. Caller is responsible
 * for choosing which scene in the timeline is the opening — this just mints
 * the payload for a given sceneId + target video model.
 */
export function buildOpeningPromptOverride(
  sceneId: string,
  targetModel: "kling" | "seedance" | "seedance-fast",
  rng?: () => number,
): ScenePromptType {
  const pick = pickWhipPanOpener(rng);
  const prompt = targetModel === "kling" ? pick.kling : pick.seedance;
  return {
    sceneId,
    prompt,
    modelChoice: targetModel,
    modelReason: "opening whip-pan bank",
    modelParams: { mode: "pro", cameraMovement: pick.cameraMovement },
  };
}
