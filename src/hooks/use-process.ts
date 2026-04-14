"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { VideoModel } from "@/lib/media/types";

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

  return useMutation({
    mutationFn: async (options: ProcessOptions) => {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Processing failed");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["assets", variables.projectId] });
      const label = variables.tool === "enhance" ? "Enhancement" : "Video generation";
      toast.success(`${label} started`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Processing failed");
    },
  });
}
