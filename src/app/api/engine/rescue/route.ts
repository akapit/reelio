/**
 * POST /api/engine/rescue — one-off rescue for a failed engine run whose
 * scene clips already exist on the provider side but whose orchestrator died
 * before assembly.
 *
 * Body: { runId: string }
 *
 * Auth: the authenticated user must own the run.
 *
 * Dispatches the `engine-rescue-run` Trigger task and returns 202 with the
 * task handle. Watch progress in the Trigger.dev dashboard (tags: `rescue`,
 * `run_<id>`). On success, `assets.processed_url` is set and `status` flips
 * to `done`, so the video shows up in the UI asset grid.
 */

import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { engineRescueRunTask } from "../../../../../trigger/engine-rescue-run";

const BodySchema = z.object({
  runId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { runId } = parsed.data;

  // Ownership + state check — only allow rescue on failed runs that belong
  // to the caller. Use the RLS-scoped server client (not the admin client)
  // so a compromised or bug-induced call can't escalate across users.
  const { data: run, error: loadErr } = await supabase
    .from("engine_runs")
    .select("id, user_id, status, asset_id")
    .eq("id", runId)
    .single();
  if (loadErr || !run) {
    return NextResponse.json(
      { error: "Run not found or not accessible" },
      { status: 404 },
    );
  }
  if (run.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (run.status !== "failed") {
    return NextResponse.json(
      {
        error: `Run is in status "${run.status}"; rescue only works on "failed" runs`,
      },
      { status: 400 },
    );
  }

  try {
    const handle = await tasks.trigger<typeof engineRescueRunTask>(
      "engine-rescue-run",
      { runId },
    );
    return NextResponse.json(
      {
        success: true,
        runId,
        assetId: run.asset_id,
        triggerRunId: handle.id,
      },
      { status: 202 },
    );
  } catch (err) {
    console.error("[engine/rescue] dispatch failed", err);
    return NextResponse.json(
      {
        error: "Failed to dispatch rescue",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
