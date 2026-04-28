/**
 * Cinematography effect library for video generations.
 *
 * An "effect" is a cohesive wrapper of curated phrases that get prepended
 * to a multi-shot video's shot prompts:
 *   - `openerPhrase`     → prepended to shot 1
 *   - `transitionPhrase` → prepended to middle shots (2..N-1) when defined
 *   - `closerPhrase`     → prepended to shot N when defined
 *
 * Effects are **additive** — they compose with the user's own prompt and
 * with the existing Supabase-backed templates (which set a base prompt +
 * music/voiceover config). A user can pick a template AND an effect.
 *
 * v1 is Kling-only. Each effect declares which `VideoModel`s it applies to
 * via `models`; the UI filters accordingly. Seedance support is added later
 * by extending each record with a single-prompt variant.
 *
 * Design spec: docs/superpowers/specs/2026-04-14-video-effects-design.md
 *
 * Pure module — no Next.js or Trigger.dev imports — so it can be consumed
 * from route handlers, trigger tasks, and client components equally.
 */

import type { VideoModel } from "@/lib/media/types";

export interface VideoEffect {
  /** Stable identifier, persisted in `assets.metadata.effectId`. */
  id: string;
  /** User-visible label shown on the picker card. */
  name: string;
  /** One-line description shown beneath the name on the picker card. ~60 chars. */
  description: string;
  /** Key into the `TEMPLATE_ICONS` map in `CreationBar.tsx`. */
  icon: string;
  /** Video models this effect applies to. v1: always `["kling"]`. */
  models: VideoModel[];
  /** Prepended to shot 1 of a Kling multi-shot. Required. */
  openerPhrase: string;
  /** Prepended to middle shots (shots 2..N-1) when the user's fan-out has ≥3 shots. */
  transitionPhrase?: string;
  /** Prepended to the final shot of a Kling multi-shot. */
  closerPhrase?: string;
}

export const VIDEO_EFFECTS: VideoEffect[] = [
  {
    id: "boutique-listing",
    name: "Boutique Listing",
    description: "Elegant dolly-in opener, smooth glides between, wide hero hold",
    icon: "film",
    models: ["kling"],
    openerPhrase:
      "Elegant slow dolly-in, warm natural light revealing the space",
    transitionPhrase:
      "Smooth measured glide into the next angle, elegant continuity",
    closerPhrase: "Gentle pull-back settling into a wide hero hold",
  },
  {
    id: "cinematic-push",
    name: "Cinematic Push",
    description: "Deep push-in with shallow depth, match-cut flow between shots",
    icon: "film",
    models: ["kling"],
    openerPhrase: "Deep cinematic push-in with shallow depth of field",
    transitionPhrase:
      "Match-cut flow into the next composition, maintained shallow depth",
    closerPhrase: "Slow settle on the final composition",
  },
  {
    id: "golden-hour",
    name: "Golden Hour Reveal",
    description: "Warm light wash catching textures, carrying across scenes",
    icon: "sun",
    models: ["kling"],
    openerPhrase:
      "Warm golden-hour wash catching surfaces and textures",
    transitionPhrase:
      "Light carrying through into the next frame, warmth continuing",
    closerPhrase: "Soft fade as light drifts across the frame",
  },
  {
    id: "editorial-pan",
    name: "Editorial Pan",
    description: "Measured horizontal pans, magazine-style framing",
    icon: "move-horizontal",
    models: ["kling"],
    openerPhrase: "Measured horizontal pan, editorial framing",
    transitionPhrase: "Continuous lateral motion into the next scene",
    closerPhrase:
      "Deliberate final hold on the strongest compositional line",
  },
  {
    id: "aerial-arrival",
    name: "Aerial Arrival",
    description: "Descending from above, overhead glide, landing grounded",
    icon: "plane",
    models: ["kling"],
    openerPhrase:
      "Descending aerial arrival revealing the space from above",
    transitionPhrase: "Continued overhead glide into the next area",
    closerPhrase: "Landing on a grounded hero frame",
  },
  {
    id: "broll-flow",
    name: "B-Roll Flow",
    description: "Soft handheld, intimate observational, relaxed pacing",
    icon: "wand",
    models: ["kling"],
    openerPhrase:
      "Soft handheld flow, intimate observational camerawork",
    transitionPhrase:
      "Soft handheld drift between scenes, relaxed pacing",
    closerPhrase: "Relaxed drift out of the scene",
  },
  {
    id: "architectural-orbit",
    name: "Architectural Orbit",
    description: "Slow orbit around features, geometric emphasis",
    icon: "compass",
    models: ["kling"],
    openerPhrase:
      "Slow orbital reveal around the central architectural feature",
    transitionPhrase:
      "Continuing the orbit into the next architectural feature",
    closerPhrase: "Geometric final framing with architectural emphasis",
  },
  {
    id: "static-boutique",
    name: "Static Hold",
    description: "Locked-off compositions, clean cuts, held details",
    icon: "frame",
    models: ["kling"],
    openerPhrase:
      "Locked-off elegant composition, subtle light shifts",
    transitionPhrase: "Clean cut to the next locked-off frame",
    closerPhrase: "Extended hold on the final detail",
  },
];

/** Look up an effect by id. Returns null for unknown ids — used by the re-run
 * flow so stale ids (effect removed since generation) don't throw. */
export function getEffect(id: string | null | undefined): VideoEffect | null {
  if (!id) return null;
  return VIDEO_EFFECTS.find((e) => e.id === id) ?? null;
}

/** Effects that apply to a given model. v1: only Kling records exist, so this
 * returns either the full list or an empty array. */
export function getEffectsForModel(model: VideoModel): VideoEffect[] {
  return VIDEO_EFFECTS.filter((e) => e.models.includes(model));
}
