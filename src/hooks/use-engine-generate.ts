"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TemplateName } from "@/lib/engine/models";
import { useI18n } from "@/lib/i18n/client";

export interface EngineGenerateOptions {
  projectId: string;
  /** Ordered list of source image asset ids. First one is the "primary". */
  imageAssetIds: string[];
  /** One of TEMPLATE_NAMES (`fast_15s`, `luxury_30s`, ...). */
  templateName: TemplateName;
  /**
   * Generation mode. "scenes" (default) runs the scene-based engine.
   * "seedance" runs the single-call Seedance 2 path (<=9 images, 4-15s).
   */
  mode?: "scenes" | "seedance";
  /** Optional video-generation backend override (server default = kieai). */
  videoProvider?: "piapi" | "kieai";
  /** User-selected video model. When set, every scene is hard-overridden to
   *  this choice after the LLM writes its prompt. Omit to let the LLM pick
   *  per scene. */
  modelChoice?: "kling" | "seedance" | "seedance-fast";
  /** Seedance mode only: target video duration 4-15s (default 15). */
  durationSec?: number;
  /** Seedance mode only: output aspect ratio. */
  aspectRatio?: "16:9" | "9:16" | "1:1";
  /** Optional ElevenLabs voiceover text. Routed to the trigger task. */
  voiceoverText?: string;
  voiceoverVoiceId?: string;
  /**
   * Seedance mode: which curated R2 library mood to pull a background
   * track from. One of "upbeat" | "luxury" | "calm". Undefined = no
   * background music.
   *
   * Scene mode still uses the deprecated `musicPrompt` until we migrate
   * that path too.
   */
  musicMood?: "upbeat" | "luxury" | "calm";
  /** Optional ElevenLabs music prompt. Used by the scene-based engine only. */
  musicPrompt?: string;
  /** 0..1 — music loudness. */
  musicVolume?: number;
}

/**
 * Hook for POST /api/engine/generate.
 *
 * Replaces the old `useProcess({ tool: "video" })` code path. Dispatches the
 * scene-based engine (planTimeline → Claude cinematography prompts →
 * per-scene Kling/Seedance → ffmpeg merge with music) and returns the
 * placeholder asset id so the UI's Supabase Realtime subscription can watch
 * it flip to `status=done`.
 */
export function useEngineGenerate() {
  const qc = useQueryClient();
  const { t } = useI18n();

  return useMutation({
    mutationFn: async (options: EngineGenerateOptions) => {
      const res = await fetch("/api/engine/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t.hooks.engineDispatchFailed);
      }
      return res.json() as Promise<{ success: true; resultAssetId: string }>;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["assets", variables.projectId] });
      toast.success(t.hooks.videoGenerationStarted);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t.hooks.engineDispatchFailed);
    },
  });
}
