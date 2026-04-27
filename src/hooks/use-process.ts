"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { VideoModel } from "@/lib/media/types";
import { useI18n } from "@/lib/i18n/client";

interface ProcessOptions {
  assetId: string;
  projectId: string;
  tool: "enhance" | "video";
  prompt?: string;
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  quality?: "fast" | "quality";
  voiceoverText?: string;
  musicPrompt?: string;
  /** 0..1 (metadata scale) */
  musicVolume?: number;
  videoModel?: VideoModel;
  /** Generic kie.ai model slug for the enhance path (e.g. "openai/gpt-image-2.0").
   * Distinct from `videoModel` which is constrained to the video provider's enum. */
  model?: string;
  /** Additional images attached to the prompt beyond `assetId`. Passed to
   * Seedance as `reference_image_urls`. */
  referenceAssetIds?: string[];
  /** Stable id of the selected video effect (metadata only — the trigger
   * task applies `effectPhrases` directly). */
  effectId?: string;
  /** Curated cinematography phrases prepended to Kling shot prompts at
   * fan-out time. */
  effectPhrases?: { opener: string; transition?: string; closer?: string };
}

export function useProcess() {
  const qc = useQueryClient();
  const { t } = useI18n();

  return useMutation({
    mutationFn: async (options: ProcessOptions) => {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t.hooks.processingFailed);
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["assets", variables.projectId] });
      toast.success(
        variables.tool === "enhance"
          ? t.hooks.enhancementStarted
          : t.hooks.videoGenerationStarted,
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t.hooks.processingFailed);
    },
  });
}
