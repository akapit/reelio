import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  RunStatus,
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
    completed_at: new Date().toISOString(),
  };
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
