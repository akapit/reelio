This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## Video Engine (deterministic multi-image pipeline)

A second, orthogonal video-generation path. Where the existing flow sends a single image + prompt to piapi.ai and gets one generative clip back, the engine takes a batch of property photos and stitches them into a structured short-form marketing video via Vision → Planner → Renderer, orchestrated by a Claude tool-use loop.

### Architecture

```
src/lib/engine/
  models.ts              # Zod schemas (ImageDataset, Template, TimelineBlueprint, RenderResult, JobResult/Error)
  vision/                # Google Cloud Vision → per-image scores + roomType
  planner/               # buildTimeline(dataset, template) → TimelineBlueprint
  renderer/              # ffmpeg (zoompan, xfade, drawtext, audio mux) → mp4
  templates/             # 5 data-driven JSON templates
  orchestrator/          # Anthropic tool-use loop (analyze_images → build_timeline → render_video)
  index.ts               # export { runEngineJob }

trigger/engine-generate.ts           # Trigger.dev task: runs engine + uploads to R2
src/app/api/engine/generate/route.ts # API dispatcher (Zod-validated body)
```

### Two video paths side by side

| | Existing flow | Engine flow |
|---|---|---|
| Trigger | CreationBar → `/api/process` | `POST /api/engine/generate` (no UI yet) |
| Worker | `trigger/generate-video.ts` | `trigger/engine-generate.ts` |
| Provider | piapi.ai (generative) | Claude + Google Vision + ffmpeg (deterministic) |
| Input | 1 image + prompt | 5–20 images + template name |
| Output | one generative clip | stitched marketing video per template spec |
| Tests | manual | 113 vitest (`npm run test`) |

### Templates

Five data-driven templates live in `src/lib/engine/templates/*.json`:

| Template | Target | AR | Min images |
|---|---|---|---|
| `fast_15s` | 15s | 9:16 | 5 |
| `investor_20s` | 20s | 16:9 | 6 |
| `family_30s` | 30s | 16:9 | 7 |
| `luxury_30s` | 30s | 16:9 | 8 |
| `premium_45s` | 45s | 16:9 | 10 |

Orchestrator rules: `usableCount < 5` aborts with `insufficient_images`; `usableCount < 8` forces `fast_15s` regardless of the requested template.

### Environment

Add to `.env.local`:

```bash
ANTHROPIC_API_KEY=...
GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/gcp-service-account.json
# Optional:
# ENGINE_ORCHESTRATOR_MODEL=claude-opus-4-6
# ENGINE_MUSIC_DIR=/abs/path/to/music-mp3s
```

**Google Cloud Vision setup** (one-time):
1. Google Cloud Console → create/select project → enable billing
2. APIs & Services → Library → enable "Cloud Vision API"
3. APIs & Services → Credentials → Create credentials → Service account → Keys → Create new key → JSON
4. Move the downloaded JSON somewhere outside the repo and point `GOOGLE_APPLICATION_CREDENTIALS` at it

**Music files**: The renderer expects 5 royalty-free mp3s in `src/lib/engine/assets/music/` (one per template mood: `luxury_cinematic`, `family_warm`, `upbeat_fast`, `investor_corporate`, `premium_elegant`). For dev/testing you can skip this with `--silent-music` on the CLI (below).

### CLI test script

Runs `runEngineJob` directly — no Next.js, no Supabase, no Trigger.dev. Fastest feedback loop for engine changes.

```bash
# Minimal test with silent audio (no mp3s needed)
npm run engine:test -- \
  --template fast_15s \
  --out /tmp/engine-test.mp4 \
  --silent-music \
  ~/Pictures/house-1.jpg ~/Pictures/house-2.jpg ~/Pictures/house-3.jpg \
  ~/Pictures/house-4.jpg ~/Pictures/house-5.jpg

# Full luxury_30s (needs 8+ images)
npx tsx scripts/test-engine.ts \
  --template luxury_30s \
  --out /tmp/luxury.mp4 \
  --silent-music \
  /path/to/exterior.jpg /path/to/living.jpg /path/to/kitchen.jpg \
  /path/to/bedroom.jpg /path/to/bathroom.jpg /path/to/hallway.jpg \
  /path/to/balcony.jpg /path/to/pool.jpg

# URLs work too
npx tsx scripts/test-engine.ts \
  --template family_30s --out /tmp/family.mp4 --silent-music \
  https://example.com/img1.jpg https://example.com/img2.jpg ...
```

CLI options:
- `--template <name>` — one of `fast_15s`, `investor_20s`, `family_30s`, `luxury_30s`, `premium_45s`
- `--out <path>` — where to write the mp4 (absolute or relative)
- `--silent-music` — generate a silent mp3 per mood so you don't need bundled music
- `-h`, `--help` — usage

Exit codes: `0` success, `1` bad args / missing env, `2` engine `JobError`, `3` uncaught exception.

On success, prints per-shot breakdown (slot id, room type, duration, motion, transition, fallback note, filename) plus total timing, codec, resolution, file size.

### API endpoint

Once you have auth + assets already in Supabase/R2:

```bash
curl -X POST http://localhost:3000/api/engine/generate \
  -H "Content-Type: application/json" \
  --cookie "..." \
  -d '{
    "projectId": "<project uuid>",
    "imageAssetIds": ["<asset uuid 1>", "<asset uuid 2>", ...],
    "templateName": "luxury_30s"
  }'
# → 202 { success: true, resultAssetId: "<uuid>" }
```

The route inserts a placeholder `assets` row (`tool_used: "engine"`, `status: "processing"`) and dispatches the Trigger.dev task. Supabase Realtime flips the row to `status: "done"` with `processed_url` once the worker finishes. Requires `npm run dev` and `npm run trigger:dev` running.

### Observability

- Per-layer single-line JSON logs: `{source: "vision" | "planner" | "engine.ffmpeg" | "engine.orchestrator", event, ...}`
- Trigger.dev tags: `asset_<id>`, `user_<id>`, `template_<name>`
- Final result persisted on the asset row under `metadata.engine.{timeline, render, totalMs}`
- Failures persisted under `metadata.lastError` (standard convention, same as existing flows)

### Tests

```bash
npm run test           # runs vitest across src/lib/engine — 113 tests, no network
npm run test:watch
npx tsc --noEmit       # typecheck (no test suite for the rest of the repo)
```

All unit tests mock external APIs (Google Vision, Anthropic, ffmpeg). Real end-to-end verification is the CLI script above.

### What's not yet wired up

- **UI**: the CreationBar does not surface the engine yet. Integration (template picker + multi-select + submit to `/api/engine/generate`) is a deliberate follow-up so this PR stays focused.
- **Music**: 5 royalty-free mp3s still need to be sourced and dropped into `src/lib/engine/assets/music/`. Use `--silent-music` on the CLI until then.
- **Thumbnails**: the engine inherits `thumbnail_url` from the first source image; a first-frame extraction pass is a follow-up.

