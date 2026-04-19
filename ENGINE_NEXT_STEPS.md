# Engine Rebuild Next Steps

This document covers the remaining work after the scene-based engine rebuild currently in the codebase.

## Current status

Implemented:
- Run-level tracking with `engine_runs`
- Step tracking with `engine_steps`
- Normalized scene, attempt, and event tracking in code and database
- Inspector UI for runs, scenes, attempts, prompts, QA, and events
- Remote image localization + crop + re-upload before scene generation
- Image-aware prompt writing
- Dedicated scene generation and scene evaluation Trigger tasks
- Round-based orchestration with one bounded retry for rejected scenes

Not yet fully completed:
- End-to-end verification of the latest Trigger child-task split
- Benchmarking and quality tuning on real projects
- Production rollout discipline

## 1. Confirm the migration in the target environment

File:
- [supabase/migrations/004_engine_scene_tracking.sql](/Users/alexanderkapit/workspace/reelio/supabase/migrations/004_engine_scene_tracking.sql:1)

Action:
- Confirm this migration is present in the active Supabase project and matches the current repo version.

Expected result:
- `engine_scenes`
- `engine_scene_attempts`
- `engine_events`

Why this matters:
- The UI has fallback behavior, but the full inspector and the new tracking model depend on these tables existing in the live DB with the expected schema.

## 2. Verify the full engine flow in development

Required processes:
- `npm run dev`
- `npm run trigger:dev`

Run these checks:

1. Trigger a new movie generation from the UI.
2. Confirm the placeholder video asset appears immediately as `processing`.
3. Confirm an `engine_runs` row is created.
4. Confirm child Trigger tasks appear:
   - `engine-plan-run`
   - `engine-generate-scene`
   - `engine-evaluate-scene`
   - `engine-assemble-video`
   - `engine-finalize-asset`
5. Open the asset inspector and verify:
   - per-scene prompt text is visible
   - prepared source / crop info is visible
   - per-attempt task ids are visible
   - QA summary and retry reasons are visible
   - event timeline is populated
6. Confirm the asset flips to `done` and `processed_url` is set.

Failure checks:
- kill `trigger:dev` and confirm the run stalls as expected
- restart it and confirm the workflow continues
- force a bad prompt / hard scene and confirm:
  - evaluation fails the candidate
  - one retry is scheduled
  - the retry is visible in attempts and events

## 3. Validate database records directly

Inspect these tables for a real run:
- `engine_runs`
- `engine_steps`
- `engine_scenes`
- `engine_scene_attempts`
- `engine_events`
- `assets`

For one completed run, verify:
- `engine_runs.status = done`
- `engine_steps` includes `scene_evaluate` and `finalize_asset`
- each scene has one row in `engine_scenes`
- retries create additional rows in `engine_scene_attempts`
- evaluation results are stored on the attempt and the scene output
- `assets.processed_url` matches the final uploaded MP4

## 4. Tighten the inspector

Current inspector is functional, but still worth improving.

Recommended additions:
- Show `scene_generate` and `scene_evaluate` as separate grouped blocks per attempt
- Add explicit “accepted on attempt N” labeling
- Add direct preview links for accepted scene clips
- Add a compact comparison view:
  - original prompt
  - retry prompt
  - evaluation summary
- Surface provider/model/crop/evaluation at the scene header level

## 5. Build a benchmark set

Create a small fixed benchmark set of listings:
- strong interior set
- weak lighting set
- exterior-heavy set
- mixed-quality image set
- edge-case set with awkward aspect ratios

For each benchmark run, record:
- template used
- scene prompts
- accepted attempt count
- retry count
- final output quality notes
- obvious failures:
  - warped geometry
  - weak motion
  - bad framing
  - repetitive scenes
  - poor opener / closer

Store this in a simple table or markdown log so changes can be compared before and after prompt/evaluator tuning.

## 6. Tune retry and QA thresholds

Current behavior:
- evaluate every generated scene
- retry once if evaluation rejects it

Tune next:
- how strict QA should be on filler scenes vs hero scenes
- whether low-scoring but acceptable clips should pass without retry
- whether `seedance-fast` should be auto-upgraded on retry
- whether retry prompts should preserve more of the original motion intent

Goal:
- reduce false-positive retries
- keep retries focused on real failures
- improve quality without doubling cost unnecessarily

## 7. Add production safeguards

Recommended safeguards before wider rollout:
- feature flag the new engine path
- record engine version in `engine_runs.input` or `summary`
- add explicit timeout/error messaging in the UI for stalled runs
- add dashboard filters for:
  - runs with retries
  - failed scene evaluations
  - runs with zero accepted scenes

Optional:
- tag runs with a benchmark label when using test projects
- add a “debug mode” toggle to expose even more detail for internal users

## 8. Consider one more architecture split

The current split is already much better, but one additional split may still be worthwhile:

- current:
  - generate scene task
  - evaluate scene task
  - assemble video task
  - finalize asset task

- possible future split:
  - generate scene candidate
  - persist accepted scene clip to owned storage
  - assemble from owned scene clips instead of provider URLs

Why:
- merge currently depends on provider-hosted scene URLs
- owning accepted scene clips would make retries, replay, and re-assembly safer

This is not required to ship, but it is a good hardening step.

## 9. Release checklist

Before calling this complete:

1. Confirm `004_engine_scene_tracking.sql` is applied in the target environment
2. Run `npx tsc --noEmit`
3. Complete at least 3 successful end-to-end generations
4. Complete at least 1 forced retry scenario
5. Inspect Trigger child tasks for one run
6. Inspect DB rows for one run
7. Confirm inspector renders scene/attempt/evaluation data correctly
8. Capture benchmark notes for at least 3 representative projects

## 10. Definition of done

This rebuild is fully done when:
- every movie generation has a visible run record
- every scene has visible prompt, prepared source, attempt history, and QA result
- every retry is attributable to a concrete evaluation decision
- failed generations are diagnosable without reading raw logs
- the migration is verified in the target environment
- benchmark comparisons exist for quality tuning
- at least one production-like run has been verified end-to-end after rollout
