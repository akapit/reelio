# Video Effects — Design

Date: 2026-04-14
Author: brainstormed with Claude
Status: approved, ready for implementation plan

## 1. Concept

A **video effect** is a cohesive cinematography wrapper that prepends curated phrases to the first, middle, and last shots of a Kling multi-shot video. It adds a "boutique" cinematic feel on top of the user's own prompt without replacing it.

- **Opener phrase** — prepended to shot 1 (the intro)
- **Transition phrase** *(optional)* — prepended to every middle shot (2..N−1), giving the video a cohesive motion/tone across cuts
- **Closer phrase** *(optional)* — prepended to the final shot (the outro)

One effect = one cohesive bundle. The user picks a single effect (same UX as picking a template). Styles (existing full-prompt templates) and Effects (this new thing) are independent and can both be active at the same time.

**Scope:** Kling only for v1. Seedance support lands later as a single-prompt variant on each effect record.

### Example: "Boutique Listing" with 3 images

User types: *"Kitchen with marble island, living room with fireplace, bedroom with large window"*

After effect application, the three Kling shots become:
- **Shot 1:** *"Elegant slow dolly-in, warm natural light revealing the space. Kitchen with marble island."*
- **Shot 2:** *"Smooth measured glide into the next angle, elegant continuity. Living room with fireplace."*
- **Shot 3:** *"Gentle pull-back to a wide hero hold. Bedroom with large window."*

## 2. Data model

New module: `src/lib/media/effects/library.ts`.

```ts
import type { VideoModel } from "@/lib/media/types";

export interface VideoEffect {
  id: string;                   // "boutique-listing" — stable identifier, used in metadata
  name: string;                  // "Boutique Listing" — user-visible label
  description: string;           // ~60 chars — shown on the picker card
  icon: string;                  // key into the existing TEMPLATE_ICONS map (lucide-react)
  models: VideoModel[];          // ["kling"] for v1
  openerPhrase: string;          // required — the intro wrap
  transitionPhrase?: string;     // optional — applied to every middle shot
  closerPhrase?: string;         // optional — the outro wrap
}

export const VIDEO_EFFECTS: VideoEffect[];

export function getEffect(id: string | null | undefined): VideoEffect | null;
```

Storage: hardcoded TypeScript array. Ship faster, iterate in git. Migrate to a Supabase `effects` table later when user-authored effects or non-engineer curation become needed.

## 3. Seed catalog (v1, Kling)

Eight starter effects. Phrasing is provisional — final copy reviewed at implementation time.

| id | Name | Opener | Transition | Closer |
|---|---|---|---|---|
| `boutique-listing` | Boutique Listing | Elegant slow dolly-in, warm natural light revealing the space | Smooth measured glide into the next angle, elegant continuity | Gentle pull-back to a wide hero hold |
| `cinematic-push` | Cinematic Push | Deep cinematic push-in, shallow depth of field | Match-cut flow into the next composition, maintained shallow depth | Slow settle on the final composition |
| `golden-hour` | Golden Hour Reveal | Warm golden-hour wash catching surfaces and textures | Light carrying through into the next frame, warmth continuing | Soft fade as light drifts across the frame |
| `editorial-pan` | Editorial Pan | Measured horizontal pan, editorial framing | Continuous lateral motion into the next scene | Deliberate final hold on the strongest compositional line |
| `aerial-arrival` | Aerial Arrival | Descending aerial arrival revealing the space from above | Continued overhead glide into the next area | Landing on a grounded hero frame |
| `broll-flow` | B-Roll Flow | Soft handheld flow, intimate observational camerawork | Soft handheld drift between scenes, relaxed pacing | Relaxed drift out of the scene |
| `architectural-orbit` | Architectural Orbit | Slow orbital reveal around the central feature | Continuing the orbit into the next architectural feature | Geometric final framing, architectural emphasis |
| `static-boutique` | Static Hold | Locked-off elegant composition, subtle light shifts | Clean cut to the next locked-off frame | Extended hold on the final detail |

Icons: reuse existing `TEMPLATE_ICONS` map where sensible (e.g., `Film`, `Camera`, `Sparkles`, `Sun`, `Compass`). Add new keys to the map if no existing icon fits.

## 4. UI integration

### Existing state

`src/components/media/CreationBar.tsx` has a **Templates dropdown** (`templatesOpen`, `selectedTemplateId`, `applyTemplate`) that renders a grid of template cards from the Supabase `templates` table.

### New state — effect picker lives inside the same dropdown

The templates dropdown panel becomes a two-section panel:

```
┌─────────────────────────────────┐
│ STYLES                          │
│ [🏠 Luxury Listing]  [🏙 Urban]  │  ← existing, unchanged behavior
│ [🌿 Natural Home]  [...]        │
│                                 │
│ ─────────────────────────────── │
│ EFFECTS  (Kling only)           │
│ [🎬 Boutique Listing]           │  ← new
│ [🎥 Cinematic Push]             │
│ [✨ Golden Hour Reveal]  [...]   │
└─────────────────────────────────┘
```

### Behaviors

- **Effect card** shows icon + name + a tiny one-line preview. The preview reads `"Opener → Transition → Closer"` — each segment truncated to fit, omitting arrow + segment if that phrase is undefined.
- **Selection** works exactly like templates: click a card to select, click again to deselect. New state: `selectedEffectId: string | null` + `applyEffect(effect: VideoEffect)` + `clearEffect()`.
- **Active state**: card has filled accent background (mirrors current template selection styling).
- **Styles and Effects are orthogonal**: having both selected is valid. A Style sets base prompt / duration / voiceover config; an Effect wraps the shot prompts at fan-out.
- **Trigger button badge**: small accent dot next to the Templates button icon if *either* a style or an effect is selected.

### Conditional visibility

The EFFECTS section renders only when `videoModel === "kling"`. On Seedance variants it collapses (no header, no empty placeholder). If a user has an effect selected and then switches model to Seedance, `selectedEffectId` is cleared silently (same pattern as `videoDuration` snapping when model changes).

## 5. Wire protocol & shot assembly

### Client → server

The `/api/process` POST body for video tool gains two fields:

```ts
effectId?: string;          // for metadata snapshot and re-run lookup
effectPhrases?: {
  opener: string;
  transition?: string;
  closer?: string;
};
```

The `effectPhrases` object is the operative data — the trigger task uses it directly without any server-side library lookup (no "server must match client library" invariant). `effectId` is metadata only: stored on the asset for the preview-modal chip, re-run restoration, and dashboard filtering. Both fields typically arrive together but the server treats them independently — if `effectPhrases` is absent, no effect is applied regardless of `effectId`; if `effectId` is absent but phrases are present, the effect is applied "anonymously" and the chip simply shows "Custom effect".

### Trigger.dev task

`trigger/generate-video.ts` gets a new optional payload field:

```ts
effect?: {
  id?: string;
  opener: string;
  transition?: string;
  closer?: string;
};
```

**Kling branch** applies the wrap after `parseKlingShots` produces the per-shot list. New helper in `src/lib/media/prompts/kling.ts`:

```ts
export function applyEffectToShots(
  shots: KlingShot[],
  effect?: { opener: string; transition?: string; closer?: string },
): KlingShot[]
```

Implementation (using 1-indexed shot numbers for readability — the helper uses array indices internally):
- **Shot 1** → `${effect.opener}. ${shot.prompt}`
- **Shots 2 .. N−1** (only if `transition` defined) → `${effect.transition}. ${shot.prompt}`
- **Shot N** (only if `closer` defined) → `${effect.closer}. ${shot.prompt}`

For N=1: only the opener applies. For N=2: opener on shot 1, closer on shot 2, transition unused.

Pure string prepend with a `". "` separator. No whitespace gymnastics, no prompt rewriting. Emits a single structured log event `kling.effectApplied` with `{ effectId, shotCount, appliedTo: ["opener", "middle×K", "closer"] }` so the per-shot final prompts are inspectable in the Trigger dashboard.

**Seedance branch** is a no-op for v1. Logs `seedance.effectSkipped { effectId, reason: "seedance-unsupported-v1" }` if an effect payload arrives on a Seedance job — a defensive log since the UI should already clear the effect on model switch.

## 6. Persistence & re-run

### `assets.metadata` (generationConfig)

The `generationConfig` snapshot in `src/app/api/process/route.ts` gains two fields for video generations:

```ts
effectId?: string;
effectPhrases?: { opener: string; transition?: string; closer?: string };
```

Both get written at generation time. Snapshotting the phrases (not just the id) means old generations remain reproducible and inspectable even after the library is edited or an effect is removed.

### Preview modal

`PreviewModal`'s `GenerationConfig` type gains the same two fields. The detail panel renders a small chip below the prompt line:

> 🎬 Effect: Boutique Listing

Clicking the chip does nothing in v1 (display-only) — leaving room to add an "open effect in library" affordance later.

### Re-run flow

`RerunPayload` in `CreationBar.tsx` gains `effectId?: string`. `AssetGrid.onRerun` forwards `cfg.effectId` when present. The preload `useEffect` looks up the effect via `getEffect(preload.effectId)` and calls `applyEffect` to restore the selection. If the id is stale (effect removed from the library), the preload silently skips restoration — the stored `effectPhrases` in metadata still describe what was used, but the picker just starts empty.

## 7. Model compatibility

For v1:
- `VIDEO_EFFECTS` records all have `models: ["kling"]`.
- The Effects section in the UI is visible only when `videoModel === "kling"`.
- Picking a Seedance model with an effect selected → silently clears `selectedEffectId`.
- Trigger.dev task ignores `effect` payload on Seedance jobs (with a log).

**Future (not in this spec):** Seedance support lands by adding a `seedanceVariant?: string` field to each `VideoEffect` — a single phrase prepended to the Seedance single-clip prompt, since Seedance has no multi-shot concept. The picker's visibility filter switches from `model === "kling"` to `effect.models.includes(model)`. No schema change needed.

## 8. Non-goals (v1)

- User-authored effects (library stays hardcoded).
- Per-shot effect picker (one effect applies uniformly per the Q3 decision).
- Stacking multiple effects (composition of primitives is explicitly deferred).
- Seedance/Seedance-Fast support (see §7 Future).
- Effect preview video/thumbnail in the picker card (icon + text only in v1).
- Parameterized effects (e.g., "intensity" slider) — phrases are static strings.

## 9. Verification

No automated test suite in this repo (per CLAUDE.md). Verification for this feature is:

1. `npx tsc --noEmit` clean.
2. Generate a 3-image Kling video with "Boutique Listing" selected. Trigger.dev dashboard should show `kling.effectApplied` with the three prompts — shot 0 prepended with opener, shot 1 with transition, shot 2 with closer.
3. Open the resulting video's preview modal — effect chip visible, re-run restores the picker selection.
4. Switch model to Seedance-Fast → Effects section disappears, selected effect clears.
5. Switch back to Kling → Effects section reappears; selection is empty.
6. Select a template AND an effect → submit. Both should compose (template-driven prompt wrapped by effect phrases, template's music/voiceover settings honored).

## 10. Files touched (expected)

**New files:**
- `src/lib/media/effects/library.ts` — `VideoEffect` interface, `VIDEO_EFFECTS` array, `getEffect` helper

**Modified files:**
- `src/lib/media/prompts/kling.ts` — add `applyEffectToShots` helper
- `src/components/media/CreationBar.tsx` — effect state, applyEffect/clearEffect, dropdown panel rework, effect card rendering, RerunPayload extension, clear-on-model-switch effect
- `src/components/media/AssetGrid.tsx` — forward `cfg.effectId` into rerun payload
- `src/components/media/PreviewModal.tsx` — `GenerationConfig` gains effect fields, detail panel renders effect chip
- `src/app/api/process/route.ts` — accept `effectId` + `effectPhrases`, include in generationConfig, forward to trigger payload
- `src/hooks/use-process.ts` — `ProcessOptions` gains `effectId` + `effectPhrases`
- `trigger/generate-video.ts` — accept `effect` in payload, invoke `applyEffectToShots` for Kling, skip-log for Seedance
