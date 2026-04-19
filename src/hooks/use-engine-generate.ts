"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TemplateName } from "@/lib/engine/models";

export interface EngineGenerateOptions {
  projectId: string;
  /** Ordered list of source image asset ids. First one is the "primary". */
  imageAssetIds: string[];
  /** One of TEMPLATE_NAMES (`fast_15s`, `luxury_30s`, ...). */
  templateName: TemplateName;
  /** Optional video-generation backend override (server default = kieai). */
  videoProvider?: "piapi" | "kieai";
  /** User-selected video model. When set, every scene is hard-overridden to
   *  this choice after the LLM writes its prompt. Omit to let the LLM pick
   *  per scene. */
  modelChoice?: "kling" | "seedance" | "seedance-fast";
  /** Optional ElevenLabs voiceover text. Routed to the trigger task. */
  voiceoverText?: string;
  voiceoverVoiceId?: string;
  /** Optional ElevenLabs music prompt. Routed to the trigger task. */
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

  return useMutation({
    mutationFn: async (options: EngineGenerateOptions) => {
      const res = await fetch("/api/engine/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Engine dispatch failed");
      }
      return res.json() as Promise<{ success: true; resultAssetId: string }>;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["assets", variables.projectId] });
      toast.success("Video generation started");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Engine dispatch failed");
    },
  });
}
