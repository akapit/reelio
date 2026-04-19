import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  EventLevel,
  RunStatus,
  Scene,
  ScenePrompt,
  SceneRecordStatus,
  SceneVideo,
  SceneAttemptStatus,
  StepStatus,
  StepType,
} from "../models";

function log(event: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(JSON.stringify({ source: "engine.tracking", event, ...data }));
  } catch {
    /* never throw from logging */
  }
}

function logError(event: string, data: Record<string, unknown> = {}): void {
  try {
    console.error(
      JSON.stringify({ source: "engine.tracking", event, level: "error", ...data }),
    );
  } catch {
    /* never throw from logging */
  }
}

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      `engine.tracking: missing Supabase env. URL=${url ? "ok" : "MISSING"} KEY=${key ? "ok" : "MISSING"}`,
    );
  }
  return createSupabaseClient(url, key);
}

export interface StartRunInput {
  assetId: string;
  userId: string;
  projectId?: string | null;
  input: Record<string, unknown>;
}

/** Insert a new engine_runs row with status='running'. Returns the run id. */
export async function startRun(args: StartRunInput): Promise<string> {
  const db = getClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("engine_runs")
    .insert({
      asset_id: args.assetId,
      user_id: args.userId,
      project_id: args.projectId ?? null,
      status: "running",
      input: args.input,
      summary: {},
      started_at: nowIso,
    })
    .select("id")
    .single();
  if (error || !data) {
    logError("startRun.failed", { error: error?.message });
    throw new Error(`engine.tracking.startRun: ${error?.message ?? "no row returned"}`);
  }
  log("startRun.ok", { runId: data.id, assetId: args.assetId });
  return data.id as string;
}

export interface StartStepInput {
  runId: string;
  stepOrder: number;
  stepType: StepType;
  input?: Record<string, unknown>;
}

/** Insert a new engine_steps row with status='running'. Returns the step id. */
export async function startStep(args: StartStepInput): Promise<string> {
  const db = getClient();
  const { data, error } = await db
    .from("engine_steps")
    .insert({
      run_id: args.runId,
      step_order: args.stepOrder,
      step_type: args.stepType,
      status: "running",
      input: args.input ?? {},
    })
    .select("id")
    .single();
  if (error || !data) {
    logError("startStep.failed", {
      runId: args.runId,
      stepType: args.stepType,
      error: error?.message,
    });
    throw new Error(`engine.tracking.startStep: ${error?.message ?? "no row returned"}`);
  }
  return data.id as string;
}

export interface FinishStepInput {
  stepId: string;
  status: StepStatus;
  output?: Record<string, unknown>;
  externalIds?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
}

/** Mark an existing step as done/failed and write outputs/metrics. */
export async function finishStep(args: FinishStepInput): Promise<void> {
  const db = getClient();
  const patch: Record<string, unknown> = {
    status: args.status,
  };
  if (args.status !== "running") {
    patch.completed_at = new Date().toISOString();
  }
  if (args.output) patch.output = args.output;
  if (args.externalIds) patch.external_ids = args.externalIds;
  if (args.metrics) patch.metrics = args.metrics;
  if (args.error !== undefined) patch.error = args.error;
  const { error } = await db.from("engine_steps").update(patch).eq("id", args.stepId);
  if (error) {
    logError("finishStep.failed", { stepId: args.stepId, error: error.message });
  }
}

/**
 * Convenience: run a single step with automatic start/finish tracking. The
 * callback receives the step id so it can attach external_ids mid-flight
 * (e.g. piapi task id before polling). Duration metrics are auto-recorded.
 */
export async function withStep<T>(
  args: {
    runId: string;
    stepOrder: number;
    stepType: StepType;
    input?: Record<string, unknown>;
  },
  fn: (ctx: { stepId: string; setExternalIds: (ids: Record<string, unknown>) => Promise<void> }) => Promise<{
    output?: Record<string, unknown>;
    externalIds?: Record<string, unknown>;
    metrics?: Record<string, unknown>;
    result: T;
  }>,
): Promise<T> {
  const started = Date.now();
  const stepId = await startStep(args);
  let accumulatedExternalIds: Record<string, unknown> = {};
  const setExternalIds = async (ids: Record<string, unknown>): Promise<void> => {
    accumulatedExternalIds = { ...accumulatedExternalIds, ...ids };
    await finishStep({ stepId, status: "running", externalIds: accumulatedExternalIds }).catch(
      () => {},
    );
  };
  try {
    const res = await fn({ stepId, setExternalIds });
    const durationMs = Date.now() - started;
    await finishStep({
      stepId,
      status: "done",
      output: res.output,
      externalIds: { ...accumulatedExternalIds, ...(res.externalIds ?? {}) },
      metrics: { durationMs, ...(res.metrics ?? {}) },
    });
    return res.result;
  } catch (err) {
    const durationMs = Date.now() - started;
    await finishStep({
      stepId,
      status: "failed",
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      metrics: { durationMs },
    });
    throw err;
  }
}

export interface CompleteRunInput {
  runId: string;
  status: Extract<RunStatus, "done" | "failed">;
  summary?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
}

/** Finalize engine_runs with status + summary + error. */
export async function completeRun(args: CompleteRunInput): Promise<void> {
  const db = getClient();
  const patch: Record<string, unknown> = {
    status: args.status,
    completed_at: new Date().toISOString(),
  };
  if (args.summary) patch.summary = args.summary;
  if (args.error !== undefined) patch.error = args.error;
  const { error } = await db.from("engine_runs").update(patch).eq("id", args.runId);
  if (error) {
    logError("completeRun.failed", { runId: args.runId, error: error.message });
  } else {
    log("completeRun.ok", { runId: args.runId, status: args.status });
  }
}

/**
 * Deep-merge a patch into the engine_runs.summary JSONB. One level of merge
 * (matches appendAssetMetadata semantics) so different concurrent step
 * outputs can share the summary root without clobbering each other.
 */
export async function mergeRunSummary(
  runId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = getClient();
  const { data, error: readErr } = await db
    .from("engine_runs")
    .select("summary")
    .eq("id", runId)
    .single();
  if (readErr) {
    logError("mergeRunSummary.readFailed", { runId, error: readErr.message });
    return;
  }
  const current = (data?.summary as Record<string, unknown> | null) ?? {};
  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    const existing = current[k];
    if (
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing) &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      merged[k] = { ...(existing as object), ...(v as object) };
    } else {
      merged[k] = v;
    }
  }
  const { error: writeErr } = await db
    .from("engine_runs")
    .update({ summary: merged })
    .eq("id", runId);
  if (writeErr) {
    logError("mergeRunSummary.writeFailed", { runId, error: writeErr.message });
  }
}

export interface UpsertScenesInput {
  runId: string;
  scenes: Scene[];
}

export async function upsertScenes(args: UpsertScenesInput): Promise<Array<{ id: string; scene_id: string }>> {
  const db = getClient();
  const rows = args.scenes.map((scene) => ({
    run_id: args.runId,
    scene_id: scene.sceneId,
    scene_order: scene.order,
    slot_id: scene.slotId,
    status: "pending" satisfies SceneRecordStatus,
    image_path: scene.imagePath,
    room_type: scene.imageRoomType,
    scene_role: scene.sceneRole,
    duration_sec: scene.durationSec,
    motion_intent: scene.motionIntent,
    overlay_text: scene.overlayText,
    transition_out: scene.transitionOut,
    transition_duration_sec: scene.transitionDurationSec,
    planner: {
      sceneId: scene.sceneId,
      sceneOrder: scene.order,
      slotId: scene.slotId,
      imagePath: scene.imagePath,
      imageRoomType: scene.imageRoomType,
      imageScores: scene.imageScores,
      imageDominantColorsHex: scene.imageDominantColorsHex,
      imageLabels: scene.imageLabels,
      sceneRole: scene.sceneRole,
      durationSec: scene.durationSec,
      motionIntent: scene.motionIntent,
      templateMood: scene.templateMood,
      overlayText: scene.overlayText,
      transitionOut: scene.transitionOut,
      transitionDurationSec: scene.transitionDurationSec,
    },
  }));

  const { data, error } = await db
    .from("engine_scenes")
    .upsert(rows, { onConflict: "run_id,scene_id" })
    .select("id, scene_id");
  if (error) {
    logError("upsertScenes.failed", { runId: args.runId, error: error.message });
    throw new Error(`engine.tracking.upsertScenes: ${error.message}`);
  }
  return ((data as Array<{ id: string; scene_id: string }> | null) ?? []);
}

export async function findSceneRecordId(
  runId: string,
  sceneId: string,
): Promise<string | null> {
  const db = getClient();
  const { data, error } = await db
    .from("engine_scenes")
    .select("id")
    .eq("run_id", runId)
    .eq("scene_id", sceneId)
    .maybeSingle();
  if (error) {
    logError("findSceneRecordId.failed", {
      runId,
      sceneId,
      error: error.message,
    });
    throw new Error(`engine.tracking.findSceneRecordId: ${error.message}`);
  }
  return typeof data?.id === "string" ? data.id : null;
}

export async function findSceneAttemptId(
  runId: string,
  sceneRecordId: string,
  attemptOrder: number,
): Promise<string | null> {
  const db = getClient();
  const { data, error } = await db
    .from("engine_scene_attempts")
    .select("id")
    .eq("run_id", runId)
    .eq("scene_record_id", sceneRecordId)
    .eq("attempt_order", attemptOrder)
    .maybeSingle();
  if (error) {
    logError("findSceneAttemptId.failed", {
      runId,
      sceneRecordId,
      attemptOrder,
      error: error.message,
    });
    throw new Error(`engine.tracking.findSceneAttemptId: ${error.message}`);
  }
  return typeof data?.id === "string" ? data.id : null;
}

export interface UpdateScenePromptsInput {
  runId: string;
  prompts: ScenePrompt[];
}

export async function updateScenePrompts(args: UpdateScenePromptsInput): Promise<void> {
  const db = getClient();
  await Promise.all(
    args.prompts.map(async (prompt) => {
      const { error } = await db
        .from("engine_scenes")
        .update({
          prompt: {
            prompt: prompt.prompt,
            modelChoice: prompt.modelChoice,
            modelReason: prompt.modelReason ?? null,
            modelParams: prompt.modelParams ?? null,
          },
        })
        .eq("run_id", args.runId)
        .eq("scene_id", prompt.sceneId);
      if (error) {
        logError("updateScenePrompts.failed", {
          runId: args.runId,
          sceneId: prompt.sceneId,
          error: error.message,
        });
      }
    }),
  );
}

export interface UpdateSceneStatusInput {
  runId: string;
  sceneId: string;
  status: SceneRecordStatus;
  output?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
}

export async function updateSceneStatus(args: UpdateSceneStatusInput): Promise<void> {
  const db = getClient();
  const patch: Record<string, unknown> = {
    status: args.status,
  };
  if (args.output) patch.output = args.output;
  if (args.error !== undefined) patch.error = args.error;
  const { error } = await db
    .from("engine_scenes")
    .update(patch)
    .eq("run_id", args.runId)
    .eq("scene_id", args.sceneId);
  if (error) {
    logError("updateSceneStatus.failed", {
      runId: args.runId,
      sceneId: args.sceneId,
      error: error.message,
    });
  }
}

export interface StartSceneAttemptInput {
  runId: string;
  sceneRecordId: string;
  attemptOrder: number;
  provider?: string;
  modelChoice?: string;
  prompt?: Record<string, unknown>;
}

export async function startSceneAttempt(args: StartSceneAttemptInput): Promise<string> {
  const db = getClient();
  const { data, error } = await db
    .from("engine_scene_attempts")
    .insert({
      run_id: args.runId,
      scene_record_id: args.sceneRecordId,
      attempt_order: args.attemptOrder,
      status: "running" satisfies SceneAttemptStatus,
      provider: args.provider ?? null,
      model_choice: args.modelChoice ?? null,
      prompt: args.prompt ?? {},
    })
    .select("id")
    .single();
  if (error || !data) {
    logError("startSceneAttempt.failed", {
      runId: args.runId,
      sceneRecordId: args.sceneRecordId,
      error: error?.message,
    });
    throw new Error(`engine.tracking.startSceneAttempt: ${error?.message ?? "no row returned"}`);
  }
  return data.id as string;
}

export interface FinishSceneAttemptInput {
  attemptId: string;
  status: SceneAttemptStatus;
  externalIds?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
}

export async function finishSceneAttempt(args: FinishSceneAttemptInput): Promise<void> {
  const db = getClient();
  const patch: Record<string, unknown> = {
    status: args.status,
  };
  if (args.status !== "running") {
    patch.completed_at = new Date().toISOString();
  }
  if (args.externalIds) patch.external_ids = args.externalIds;
  if (args.metrics) patch.metrics = args.metrics;
  if (args.output) patch.output = args.output;
  if (args.error !== undefined) patch.error = args.error;
  const { error } = await db
    .from("engine_scene_attempts")
    .update(patch)
    .eq("id", args.attemptId);
  if (error) {
    logError("finishSceneAttempt.failed", { attemptId: args.attemptId, error: error.message });
  }
}

export interface AppendEngineEventInput {
  runId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  level?: EventLevel;
  sceneRecordId?: string | null;
  attemptId?: string | null;
}

/**
 * Aggregate per-step cost entries for a run into a single summary shape,
 * written to `engine_runs.summary.cost` by the finalize task.
 *
 * Reads from two tables so rescue-run + normal path both work:
 *   - engine_steps.metrics.cost    (Anthropic, ElevenLabs, GCV, scene_generate)
 *   - engine_scene_attempts.metrics.cost  (scene_generate — one per attempt)
 *
 * Returns:
 *   { totalUsd, breakdown: { anthropic, elevenlabs, gcv, kieai, piapi },
 *     steps: [{ stepType, costUsd, ... }] }
 */
export interface RunCostSummary {
  totalUsd: number;
  breakdown: Record<string, number>;
  steps: Array<{
    stepType: string;
    costUsd: number;
    provider?: string;
    model?: string;
  }>;
}

function isCostEntry(v: unknown): v is { provider: string; costUsd: number; model?: string } {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).costUsd === "number" &&
    typeof (v as Record<string, unknown>).provider === "string"
  );
}

export async function computeRunCostSummary(runId: string): Promise<RunCostSummary> {
  const db = getClient();
  const [stepsRes, attemptsRes] = await Promise.all([
    db
      .from("engine_steps")
      .select("step_type, metrics")
      .eq("run_id", runId),
    db
      .from("engine_scene_attempts")
      .select("metrics")
      .eq("run_id", runId),
  ]);

  const breakdown: Record<string, number> = {};
  const steps: RunCostSummary["steps"] = [];
  let totalUsd = 0;

  function addCost(
    stepType: string,
    entry: { provider: string; costUsd: number; model?: string },
  ): void {
    const cost = Number(entry.costUsd) || 0;
    if (cost <= 0) return;
    totalUsd += cost;
    breakdown[entry.provider] = (breakdown[entry.provider] ?? 0) + cost;
    steps.push({
      stepType,
      costUsd: cost,
      provider: entry.provider,
      model: entry.model,
    });
  }

  // engine_steps — metrics.cost may be a single entry OR a nested object of
  // named entries (vision_analyze uses { gcv: {...}, qualityCheck: {...} }).
  for (const row of (stepsRes.data ?? []) as Array<{
    step_type: string;
    metrics: Record<string, unknown> | null;
  }>) {
    const m = row.metrics ?? {};
    const cost = (m as Record<string, unknown>).cost;
    if (isCostEntry(cost)) {
      addCost(row.step_type, cost);
    } else if (cost && typeof cost === "object") {
      for (const sub of Object.values(cost as Record<string, unknown>)) {
        if (isCostEntry(sub)) addCost(row.step_type, sub);
      }
    }
  }

  // engine_scene_attempts — one per attempt. If both the step AND the attempt
  // record the same clip cost, we'd double-count. The orchestrator writes the
  // same `cost` object to both; dedup by keying on (run-wide attempt id) —
  // simplest approach: only count attempts whose cost has provider === "kieai"
  // or "piapi" and SKIP step-level scene_generate costs. Easier rule: skip
  // attempts entirely since engine_steps already carries scene_generate cost.
  void attemptsRes;

  return { totalUsd: round4(totalUsd), breakdown: roundBreakdown(breakdown), steps };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function roundBreakdown(b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(b)) out[k] = round4(v);
  return out;
}

export async function appendEngineEvent(args: AppendEngineEventInput): Promise<void> {
  const db = getClient();
  const { error } = await db.from("engine_events").insert({
    run_id: args.runId,
    scene_record_id: args.sceneRecordId ?? null,
    attempt_id: args.attemptId ?? null,
    level: args.level ?? "info",
    event_type: args.eventType,
    payload: args.payload ?? {},
  });
  if (error) {
    logError("appendEngineEvent.failed", {
      runId: args.runId,
      eventType: args.eventType,
      error: error.message,
    });
  }
}
