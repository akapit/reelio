# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Trigger.dev reference

**Trigger.dev v4 docs live in `.cursor/rules/trigger.*.mdc`** (basic, advanced-tasks, config, realtime, scheduled-tasks). Read those rules first when touching anything under `trigger/` or adding new background tasks. Key rule: use `@trigger.dev/sdk`, never the v2 `client.defineJob`.

## Commands

```bash
npm run dev             # Next.js dev server (http://localhost:3000)
npm run build           # production build
npm run lint            # ESLint (eslint-config-next)
npm run trigger:dev     # Trigger.dev local worker — REQUIRED to run background tasks in dev
npx tsc --noEmit        # typecheck-only (there is no test suite)
```

You need `npm run dev` AND `npm run trigger:dev` running in parallel for the full stack to work — any generation will sit in "processing" forever without the trigger worker.

There is no test suite. Verification is `npx tsc --noEmit` + running the feature in the browser and checking the Trigger.dev dashboard.

## Architecture

Reelio is an AI-powered real-estate media platform: users upload photos, and kie.ai-backed models enhance/stage/re-sky them or animate them into short videos with optional ElevenLabs voiceover + background music.

### Generation flow (two paths)

There are two fire-and-forget pipelines, both split between a Next.js API route (fast, synchronous) and a Trigger.dev task (long-running, retryable). Both drop a placeholder `assets` row first so the UI shows "processing" instantly and flip it via Supabase Realtime when done (`src/hooks/use-assets.ts`).

**Path A — Image tools** (enhance / staging / sky):
1. `CreationBar` (via `src/hooks/use-process.ts`) POSTs to `/api/process`.
2. `src/app/api/process/route.ts` dispatches `trigger/{enhance-image,virtual-staging,sky-replacement}.ts`.
3. The trigger task calls `kieaiProvider.{enhanceImage,virtualStaging,skyReplacement}`, uploads to R2, updates the placeholder to `status='done'`.

**Path B — Video generation (scene-based engine)**:
1. `CreationBar` (via `src/hooks/use-engine-generate.ts`) POSTs to `/api/engine/generate` with `{ projectId, imageAssetIds, templateName, videoProvider?, voiceoverText?, musicPrompt?, musicVolume? }`.
2. `src/app/api/engine/generate/route.ts` dispatches `trigger/engine-generate.ts`.
3. `engineGenerateTask` calls `runEngineJob` (`src/lib/engine/orchestrator/orchestrator.ts`), which runs the 6-step imperative pipeline:
   - **Vision analyze** — Google Cloud Vision returns labels + localized-object bboxes (`src/lib/engine/vision/analyzer.ts`).
   - **Plan timeline** — slot-fill scene roles (`opening/hero/wow/filler/closing`) from the chosen template (`src/lib/engine/planner/planner.ts`).
   - **Scene prompts** — Claude writes one cinematography prompt per scene (`src/lib/engine/prompt-writer/writer.ts`, `claude-sonnet-4-6`).
   - **Scene generate** — parallel Kling / Seedance i2v calls via `piapiProvider` (default) or `kieaiProvider`, with smart-crop preprocessing (`src/lib/engine/vision/smartCrop.ts`) using the vision bboxes so 4:3 sources don't crop subjects when rendered to 9:16.
   - **Audio** — ElevenLabs voiceover + background music (optional).
   - **Merge** — ffmpeg concat with xfade transitions + audio mux (`src/lib/engine/merge/ffmpeg.ts`).
4. Result MP4 is uploaded to R2; asset row flipped to `status='done'`. Every step is persisted to `engine_runs`/`engine_steps` in Supabase when the request supplies `tracking`.

CLI harness for the engine: `scripts/test-engine.ts` (see `npx tsx scripts/test-engine.ts --help`). Flags: `--template <name>`, `--provider piapi|kieai`, `--resume`, `-v`.

**Provider toggle**: `ENGINE_VIDEO_PROVIDER=piapi|kieai` env or `videoProvider` field in the API body. Default `piapi`. Both satisfy the same `IMediaProvider.generateVideo` interface.

If you add a new image tool, extend Path A. New video templates go in `src/lib/engine/templates/*.json` + `TEMPLATE_NAMES` in `models.ts`. New video models plug in via the planner's `VideoModelChoice` enum and the provider's model-slug map.

### Media providers (`src/lib/media/`)

Everything media-related — video generation (Kling, Seedance 2.0, Seedance 2.0 Fast), image enhancement (nano-banana-pro), virtual staging + sky replacement (Flux Kontext) — goes through **kie.ai** via `src/lib/media/providers/kieai.ts`. There is *one* unified `createTask` endpoint plus a separate Flux Kontext endpoint; the file picks which based on the model slug.

- `VIDEO_MODEL_SLUGS` maps logical ids (`kling` / `seedance` / `seedance-fast`) to real kie.ai slugs. Callers upstream pass the logical id; the provider resolves it. Raw slugs are also accepted as pass-through.
- **Providers stay pure** — no Next.js or trigger.dev imports. They accept an optional `onTaskId(taskId)` callback so the caller can persist the upstream task id *before* polling starts (critical: polling times out lose context otherwise).
- **Seedance has a distinct input schema from Kling**: integer `duration` in [4, 15], `first_frame_url` (string) not `image_urls` (array), required `web_search`, `generate_audio` instead of `sound`. The `isSeedance = model.startsWith("bytedance/seedance")` branch in `generateVideo()` handles this.
- **Seedance mutex**: `first_frame_url` and `reference_image_urls` are mutually exclusive (kie.ai returns 422 if both). The branch uses `first_frame_url` for single-image prompts and `reference_image_urls` only for multi-image prompts (combining primary + extras, capped at 9).

### Seedance prompt translation (`src/lib/media/prompts/seedance.ts`)

Seedance produces poor output for terse cinematography-style prompts. A two-tier translator runs in the Seedance branch only (Kling is untouched):

1. **Tier 1 (always)**: strip `@imageN` UI mention tokens → "the source image", trim. If `< 25` chars → static real-estate default.
2. **Tier 2 (LLM)**: if cleaned prompt is terse (< 12 words, or camera-verb-dominated), call the kie.ai codex endpoint (`https://api.kie.ai/codex/v1/responses`, `gpt-5-4`, same as `src/app/api/generate-script/route.ts`) with a 5-second `AbortController` timeout. Silent fallback to Tier 1 on any failure.

Translator logs `seedance.promptTranslated` with `reason` (`empty | tooShortAfterClean | terse | llmFailed | richPassthrough`) via the shared `logKie` helper.

### Observability / external-API tracking

All external calls (kie.ai, ElevenLabs, R2) emit single-line JSON via `console.log` (captured by Trigger.dev console ingestion). Helpers: `logKie`/`logKieError` in `kieai.ts`, `logEl`/`logElError` in `elevenlabs.ts`, `logR2`/`logR2Error` in `trigger/_shared.ts`.

Trigger tasks additionally use `logger.info/error`, `metadata.set`, and `tags.add` from `@trigger.dev/sdk` — every run gets `asset_<id>`, `user_<id>`, and (for video) `model_<slug>` + `kie_<taskId>` tags so runs are searchable in the dashboard.

**External IDs are persisted on the asset row** via `appendAssetMetadata(assetId, patch)` in `trigger/_shared.ts` — writes into `assets.metadata.externalIds.{kieai,elevenlabs}` with one level of deep-merge. This means you can run `select metadata->'externalIds' from assets where id = '<uuid>'` to get the kie.ai taskId + ElevenLabs request IDs for any asset.

### Audio (`src/lib/audio/`)

`elevenlabs.ts` exposes `generateVoiceover` and `generateBackgroundMusic`. Both return `{ buffer, requestId, durationMs, model, byteLength }` — destructure `buffer` at the call site. `requestId` comes from the `x-request-id` response header.

`merge.ts` muxes video + voiceover + music via FFmpeg (installed by the trigger.config build extension — see `.cursor/rules/trigger.config.mdc`).

### Prompt history / re-run

Every video generation persists prompt + model + duration + voiceover/music config into `assets.metadata` and sets `source_asset_id` FK → source image row. The `PreviewModal` detail panel (opened by clicking a past video) shows these fields and renders a **Re-run** button.

Re-run path: `AssetGrid` → `onRerun` callback → project page sets a `creationPreload` `RerunPayload` (with a monotonic `nonce`) → `CreationBar` `useEffect` keyed on `preload.nonce` rehydrates all state (clears pending files, installs the source asset as an `existingAsset`, switches to video mode, restores prompt/model/duration/voiceover/music). The project page scrolls the CreationBar into view.

### Data model

- `profiles`, `projects`, `assets` — see `supabase/migrations/001_initial.sql`.
- `assets.metadata` JSONB carries: generation config (`prompt`, `duration`, `videoModel`, `voiceoverText`, `musicPrompt`, `musicVolume`, `aspectRatio`, `quality`, `referenceAssetIds`), `externalIds.{kieai,elevenlabs}`, and `lastError` on failure.
- `assets.source_asset_id` (migration 002) FKs derived outputs to their source image.
- `assets.thumbnail_url` is used in code but was added outside the `001_initial.sql` migration — do not assume it's part of the base schema when reasoning about migrations.
- Apply pending migrations via the Supabase MCP (`mcp__claude_ai_Supabase__apply_migration`) — files in `supabase/migrations/` do **not** auto-apply.

### UI patterns (`src/components/media/`)

- `CreationBar.tsx` is the "prompt box" users interact with. It handles drag-drop, `@imageN` mention autocomplete, model selection (Kling/Seedance/Seedance Fast), duration (5s/10s only), voiceover + music toggles, and the re-run preload effect. `uploadedAssetIds = [firstAssetId, ...referenceAssetIds]` — first image becomes the primary, rest become references.
- `PreviewModal.tsx` is reused for both plain previews and the video-history detail view (extended via optional `generationConfig` / `sourceAsset` / `onRerun` props).
- Asset grid uses React Query + Supabase Realtime — changes to `assets` rows auto-invalidate `["assets", projectId]`.

### Auth / Supabase

Two clients, **do not mix**:
- `src/lib/supabase/server.ts` — server components + route handlers (cookies-based).
- `src/lib/supabase/client.ts` — client components only (browser session).

Row-level security is on; every `assets` / `projects` query must respect `auth.uid() = user_id`. API routes double-check ownership before acting.

### Storage

Cloudflare R2 via `@aws-sdk/client-s3` S3-compatible interface (`src/lib/r2.ts`). Uploads use a pre-signed URL flow (`/api/upload-url`) for user-provided source images; generated outputs are uploaded server-side inside the trigger task.

## Gotchas

- **Run two processes in dev**: Next.js *and* the Trigger.dev worker. Generations appear to hang if the worker isn't running.
- **No test suite**: verify via typecheck + browser + Trigger.dev dashboard. Log-driven debugging — filter runs by tag (`kie_<taskId>`, `asset_<id>`) or inspect `metadata.externalIds` on the asset row.
- **Duration enums differ per model**: UI exposes 5s/10s only; Seedance's API accepts 4–15, Kling is model-dependent. The provider clamps Seedance to [4, 15].
- **The `metadata` JSONB is shared** between re-run config, external IDs, and `lastError` — always deep-merge via `appendAssetMetadata`, never clobber by assigning `metadata: { ... }` in an update.
- **Providers are pure**: do not import from `next/*` or `@trigger.dev/sdk` inside `src/lib/media/`. They run both in API routes and in the trigger worker.

## Working rules

- Read the full file before editing. Plan all changes, then make ONE complete edit. If you've edited a file 3+ times, stop and re-read the user's requirements.
- Every few turns, re-read the original request to make sure you haven't drifted from the goal.
- When the user corrects you, stop and re-read their message. Quote back what they asked for and confirm before proceeding.
- Re-read the user's last message before responding. Follow through on every instruction completely.
- When stuck, summarize what you've tried and ask the user for guidance instead of retrying the same approach.
- Work more autonomously. Make reasonable decisions without asking for confirmation on every step.
- After 2 consecutive tool failures, stop and change your approach entirely. Explain what failed and try a different strategy.
