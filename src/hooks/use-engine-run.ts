"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface EngineRunRecord {
  id: string;
  asset_id: string;
  status: "pending" | "running" | "done" | "failed";
  input: Record<string, unknown>;
  summary: Record<string, unknown>;
  error: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface EngineStepRecord {
  id: string;
  run_id: string;
  step_order: number;
  step_type: string;
  status: "running" | "done" | "failed";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  external_ids: Record<string, unknown>;
  metrics: Record<string, unknown>;
  error: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
}

export interface EngineSceneRecord {
  id: string;
  run_id: string;
  scene_id: string;
  scene_order: number;
  slot_id: string;
  status: "pending" | "running" | "done" | "failed";
  image_path: string;
  room_type: string;
  scene_role: string;
  duration_sec: number;
  motion_intent?: string | null;
  overlay_text?: string | null;
  transition_out?: string | null;
  transition_duration_sec?: number | null;
  planner: Record<string, unknown>;
  prompt: Record<string, unknown>;
  output: Record<string, unknown>;
  error: Record<string, unknown> | null;
}

export interface EngineSceneAttemptRecord {
  id: string;
  run_id: string;
  scene_record_id: string;
  attempt_order: number;
  status: "running" | "done" | "failed";
  provider?: string | null;
  model_choice?: string | null;
  prompt: Record<string, unknown>;
  external_ids: Record<string, unknown>;
  metrics: Record<string, unknown>;
  output: Record<string, unknown>;
  error: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
}

export interface EngineEventRecord {
  id: string;
  run_id: string;
  scene_record_id?: string | null;
  attempt_id?: string | null;
  level: "info" | "warn" | "error";
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface EngineRunData {
  run: EngineRunRecord | null;
  steps: EngineStepRecord[];
  scenes: EngineSceneRecord[];
  attempts: EngineSceneAttemptRecord[];
  events: EngineEventRecord[];
}

export function useEngineRun(assetId?: string | null, enabled = true) {
  const supabase = createClient();
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled || !assetId) return;
    const channel = supabase
      .channel(`engine-runs-${assetId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "engine_runs",
          filter: `asset_id=eq.${assetId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["engine-run", assetId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [assetId, enabled, qc, supabase]);

  return useQuery({
    queryKey: ["engine-run", assetId],
    enabled: enabled && !!assetId,
    queryFn: async (): Promise<EngineRunData> => {
      if (!assetId) {
        return { run: null, steps: [], scenes: [], attempts: [], events: [] };
      }

      const { data: runs, error: runError } = await supabase
        .from("engine_runs")
        .select("*")
        .eq("asset_id", assetId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (runError) throw runError;

      const run = (runs?.[0] as EngineRunRecord | undefined) ?? null;
      if (!run) {
        return { run: null, steps: [], scenes: [], attempts: [], events: [] };
      }

      const { data: steps, error: stepError } = await supabase
        .from("engine_steps")
        .select("*")
        .eq("run_id", run.id)
        .order("step_order", { ascending: true });

      if (stepError) throw stepError;

      const { data: scenes, error: sceneError } = await supabase
        .from("engine_scenes")
        .select("*")
        .eq("run_id", run.id)
        .order("scene_order", { ascending: true });
      if (sceneError) {
        // Migration may not be applied yet; preserve fallback inspector behaviour.
        if (!sceneError.message.toLowerCase().includes("does not exist")) {
          throw sceneError;
        }
      }

      const { data: attempts, error: attemptError } = await supabase
        .from("engine_scene_attempts")
        .select("*")
        .eq("run_id", run.id)
        .order("attempt_order", { ascending: true });
      if (attemptError) {
        if (!attemptError.message.toLowerCase().includes("does not exist")) {
          throw attemptError;
        }
      }

      const { data: events, error: eventError } = await supabase
        .from("engine_events")
        .select("*")
        .eq("run_id", run.id)
        .order("created_at", { ascending: true });
      if (eventError) {
        if (!eventError.message.toLowerCase().includes("does not exist")) {
          throw eventError;
        }
      }

      return {
        run,
        steps: (steps as EngineStepRecord[] | null) ?? [],
        scenes: (scenes as EngineSceneRecord[] | null) ?? [],
        attempts: (attempts as EngineSceneAttemptRecord[] | null) ?? [],
        events: (events as EngineEventRecord[] | null) ?? [],
      };
    },
    refetchInterval: (query) => {
      const run = (query.state.data as EngineRunData | undefined)?.run;
      return run?.status === "running" ? 3000 : false;
    },
  });
}
