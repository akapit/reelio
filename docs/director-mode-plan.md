# Director Mode — Optional Agentic Layer

*Status:* draft / for later. Do not implement yet.

## Context

The current Reelio creation flow is deterministic:

1. User composes inputs in `CreationBar` → picks model, duration, prompt, toggles voiceover/music.
2. `POST /api/process` validates + inserts a placeholder asset + dispatches the Trigger.dev `generateVideoTask`.
3. Trigger task calls the provider (`kieai.ts`), for Kling fans out per-shot and concatenates, for Seedance runs single-shot. Voiceover/music are muxed via ffmpeg.
4. UI flips via Supabase Realtime when the row is `done`.

This is cheap, fast, debuggable, and predictable — virtues we want to keep for the 80% path.

What it can't do: take a high-level intent ("make a 30-second virtual tour from this listing") and decide the pipeline. Today the user has to hand-pick enhance → stage → re-sky → video → voiceover → music → concat sequencing. That's fine for power users; it's friction for first-timers.

**Intended outcome:** add an *optional* Director mode — a chat-style entry point that plans the multi-step creation, delegates to the existing tools, reports progress, and lets the user approve or redirect. The existing CreationBar stays intact and remains the fast path.

## Approach

### Layering

```
┌─────────────────────────────────────┐
│  Director (Claude Agent SDK)        │  ← new, optional
│  plans + delegates + evaluates      │
└────────────┬────────────────────────┘
             │ calls existing tools
             ▼
┌─────────────────────────────────────┐
│  Existing pipeline (unchanged)      │
│  /api/process, Trigger tasks,       │
│  kieai provider, ffmpeg mux         │
└─────────────────────────────────────┘
```

The Director never re-implements generation. It wraps each current capability as a tool and orchestrates them.

### Tool surface (what the agent can call)

Map 1:1 onto existing functionality so we don't duplicate logic:

- `enhanceImage(assetId)` → dispatches `enhanceImageTask`, returns the enhanced asset id when done.
- `virtualStage(assetId, prompt)` → dispatches `virtualStagingTask`.
- `skyReplace(assetId, prompt)` → dispatches `skyReplacementTask`.
- `generateKlingShot({ imageId, prompt, duration })` → single Kling 2.6 call (thin wrapper around `provider.generateVideo`).
- `generateSeedanceVideo({ imageIds, prompt, duration })` → single Seedance call.
- `concatenateVideos([assetIds])` → runs `concatVideos` on a list of stored videos, uploads the result.
- `generateVoiceover(text)` → ElevenLabs TTS, returns the audio asset.
- `generateMusic({ prompt, durationSec })` → ElevenLabs music, returns the audio asset.
- `muxAudioOnVideo({ videoId, voiceoverId?, musicId?, musicVolume? })` → `mergeAudioWithVideo`, returns the muxed asset.
- `describeImage(assetId)` → vision call that returns a structured scene description (used when the agent needs to reason about what's in a photo before planning shots).
- `listProjectAssets(projectId)` → read-only browse.

Each tool returns a small JSON result so the agent can reason about next steps without blowing up its context.

### Session model

Director runs are long-lived (minutes, possibly over ten tool turns) — Trigger.dev is the right host. One agent run === one Trigger task of type `director-run`. Inside that task we:

1. Boot a Claude Agent SDK session with the tool manifest.
2. Stream user messages in via WebSocket (Supabase Realtime channel scoped to `director_sessions.id`), or a polled `director_messages` table.
3. Each tool the agent picks becomes a child Trigger task via `tasks.trigger<typeof ...>` — sub-tasks write their results back to the session row, the parent agent loop reads them next turn.
4. The parent agent task stays "alive" on wait-for-event with a hard budget ceiling (see below).

Alternative: run the agent loop inside a Next.js route with `maxDuration` streaming. Cheaper for short runs; falls over on anything that needs > ~60s. Pick Trigger.dev for v1.

### UX

New route `/dashboard/projects/[id]/director` — chat-style layout:

- Left: chat with the Director. User types "Make a 30s luxury tour from these 6 photos."
- Right: live pipeline view. Each tool call shows as a card (pending / running / done / failed) with a preview when possible. Clicking a card jumps to the asset in the project.
- Bottom: controls — pause, adjust budget, inject guidance ("make shot 2 brighter"), approve/reject proposed plan before execution.

The existing CreationBar remains the default home. Director mode is a second tab.

### Budget & safety

Each session gets a ceiling, enforced in the parent task loop:

- `maxToolCalls: 20`
- `maxCostUsd: 5.00` — sum of kie.ai + ElevenLabs + Anthropic costs, tracked per-call.
- `maxDurationSec: 300`
- Every proposed action requires user approval IF it would blow through 50% of any remaining budget.

Persisted on a new `director_sessions` table with the running totals. When a ceiling is hit the agent is paused and the user is prompted to confirm continuation.

## Files to create (for later)

- `supabase/migrations/00X_director_sessions.sql` — `director_sessions`, `director_messages`, `director_tool_calls` tables + RLS.
- `src/lib/director/tools/*.ts` — tool adapters (pure wrappers around existing providers/trigger tasks).
- `src/lib/director/agent.ts` — Claude Agent SDK setup, tool manifest, system prompt.
- `trigger/director-run.ts` — parent Trigger.dev task that owns the agent loop.
- `src/app/api/director/sessions/route.ts` — create session, list sessions.
- `src/app/api/director/sessions/[id]/messages/route.ts` — post a user message; streams/ polls agent replies.
- `src/app/dashboard/projects/[id]/director/page.tsx` — the chat + pipeline UI.
- `src/components/director/Chat.tsx`, `ToolCallCard.tsx`, `BudgetMeter.tsx`.

## Phased rollout

**Phase 1 — Read-only planner.** Agent takes an intent, produces a *plan* (list of proposed tool calls with reasoning + cost estimate), shows it in the UI. User clicks "Run this plan" which falls back to the existing deterministic pipeline (one multi-step call). No live agent loop yet. Low risk, easy to ship, gives us data on whether plans are useful.

**Phase 2 — Live execution with checkpoints.** Agent executes tools itself but pauses at every major step for user approval. Budget ceilings active. Still no self-evaluation loop.

**Phase 3 — Self-evaluation.** Agent calls `describeImage` / watches video outputs (via a vision check on the first frame + metadata) and decides whether to redo a shot. This is where quality gains start but also where non-determinism hits hardest.

**Phase 4 — Autonomous mode.** Raise the budget, relax the per-step approval, let it run a full "listing → finished tour" workflow unattended. Only after phases 1–3 have proven stable.

## Architecture impact

- **New dependencies:** `@anthropic-ai/claude-agent-sdk` (or equivalent name — check current release), plus maybe `@anthropic-ai/sdk` if not already in the repo. Trigger.dev stays as the runtime; no new infra.
- **Existing pipeline unchanged.** Director calls into the same Trigger tasks; we don't refactor the 80% path. This is a deliberately non-invasive pattern — the moment the agent layer is causing bugs in the deterministic path, we've built it wrong.
- **Cost observability becomes mandatory.** Each external call is already logged (kie.ai, ElevenLabs, R2). Add a `cost_usd` column to every structured log line and aggregate into `director_sessions.running_cost`. Without this, agent budgets are guesswork.
- **Concurrency.** Today one project = one trigger at a time is implicit. Agent sessions fan out heavily (enhance 6 images in parallel, 4 Kling shots in parallel, etc.). Check Trigger.dev concurrency limits on our plan before shipping Phase 2.
- **Debuggability.** Every tool call must log its agent-session id, turn number, and parent decision context so we can replay failed runs.

## Expected results

- **Onboarding**: first-time user can describe intent in plain English and get a reasonable video without learning the composition grammar. Conversion ↑.
- **Power-user quality**: with Phase 3's self-eval loop, fewer bad shots slip through. Worth it only if we track a quality metric (user-edit rate, user-rerun rate, thumbs up/down) and see it improve.
- **Latency**: Director runs will be slower than manual — 2×–5× wall-clock for the same output because of the reasoning turns. Make this explicit in the UI (ETAs, progress cards) so users don't think it's hung.
- **Cost**: budget $0.50–$2.00 per Director session in LLM overhead on top of the existing per-asset costs. If it doesn't convert into retention, kill it.

## Main tradeoff (said plainly)

Director mode buys flexibility and potential quality at the cost of cost, latency, and debuggability. The deterministic CreationBar is load-bearing and stays that way. Ship Director as an opt-in upgrade, not a replacement.

## Open questions

1. Do we want the agent to write back to CreationBar as its output (i.e., "I planned this, approve and run it as if you'd composed it yourself")? That'd let Director feed the existing pipeline without a whole new UI.
2. Should Director get access to the database as a tool, or only to a curated "browse project" tool? Security surface differs.
3. What's our stance on Director-generated outputs being distinguishable from manually-composed ones? (metadata flag, visible badge, none?)
4. Cost attribution for billing — per-session line items vs. rolled up.
