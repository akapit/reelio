"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Images } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAssets } from "@/hooks/use-assets";
import { useProcess } from "@/hooks/use-process";
import { AssetCard } from "@/components/media/AssetCard";
import { VideoOptionsModal } from "@/components/media/VideoOptionsModal";
import { CompareModal } from "@/components/media/CompareModal";
import {
  PreviewModal,
  type GenerationConfig,
  type SourceAssetRef,
} from "@/components/media/PreviewModal";
import type { RerunPayload } from "@/components/media/CreationBar";
import type { VideoModel } from "@/lib/media/types";

interface AssetGridProps {
  projectId: string;
  onRerun?: (payload: Omit<RerunPayload, "nonce">) => void;
}

export function AssetGrid({ projectId, onRerun }: AssetGridProps) {
  const { data: assets, isLoading, isError } = useAssets(projectId);
  const process = useProcess();
  const supabase = createClient();
  const qc = useQueryClient();

  const deleteAsset = useMutation({
    mutationFn: async (assetId: string) => {
      const { error } = await supabase.from("assets").delete().eq("id", assetId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets", projectId] });
      toast.success("Asset removed");
    },
    onError: () => {
      toast.error("Failed to remove asset");
    },
  });

  const cancelProcessing = useMutation({
    mutationFn: async (assetId: string) => {
      const { error } = await supabase
        .from("assets")
        .update({ status: "uploaded", tool_used: null })
        .eq("id", assetId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets", projectId] });
      toast.success("Processing cancelled");
    },
    onError: () => {
      toast.error("Failed to cancel processing");
    },
  });

  const [videoModalAsset, setVideoModalAsset] = useState<{
    id: string;
    projectId: string;
  } | null>(null);

  const [compareAsset, setCompareAsset] = useState<{
    originalUrl: string;
    processedUrl: string;
  } | null>(null);

  const [previewAsset, setPreviewAsset] = useState<{
    assetId: string;
    originalUrl: string;
    processedUrl?: string | null;
    assetType: "image" | "video";
    generationConfig?: GenerationConfig | null;
    /** Primary first, then references from metadata.referenceAssetIds. */
    sourceAssets?: SourceAssetRef[];
  } | null>(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/3] rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-40 rounded-xl border border-red-500/20 bg-red-500/5">
        <p className="text-sm text-red-400">Failed to load assets. Please refresh.</p>
      </div>
    );
  }

  if (!assets || assets.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center justify-center gap-3 h-48 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[var(--color-surface-raised)]">
          <Images size={20} className="text-[var(--color-muted)]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--color-foreground)]">
            No assets yet
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Upload your first photo or video to get started.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {assets.map((asset, index) => (
          <motion.div
            key={asset.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.04 }}
          >
            <AssetCard
              id={asset.id}
              projectId={projectId}
              originalUrl={asset.original_url}
              processedUrl={asset.processed_url}
              status={asset.status as "uploaded" | "processing" | "done" | "failed"}
              toolUsed={
                asset.tool_used as
                  | "enhance"
                  | "staging"
                  | "sky"
                  | "video"
                  | null
                  | undefined
              }
              assetType={
                (asset.asset_type as "image" | "video") ?? "image"
              }
              thumbnailUrl={asset.thumbnail_url}
              onDelete={() => deleteAsset.mutate(asset.id)}
              onCancel={() => cancelProcessing.mutate(asset.id)}
              onEnhance={() =>
                process.mutate({ assetId: asset.id, projectId, tool: "enhance" })
              }
              onGenerateVideo={() =>
                setVideoModalAsset({ id: asset.id, projectId })
              }
              onCompare={() =>
                setCompareAsset({
                  originalUrl: asset.original_url,
                  processedUrl: asset.processed_url!,
                })
              }
              onPreview={() => {
                const assetType =
                  (asset.asset_type as "image" | "video") ?? "image";
                // Merge two metadata dialects for video assets:
                //   1. Legacy (old path-B "video" tool): config lives at
                //      `metadata.{prompt,videoModel,duration,voiceoverText,...}`.
                //   2. Engine (current path): config lives at
                //      `metadata.engineRequest.{templateName,voiceoverText,...}`
                //      and the image list at `metadata.engineRequest.imageAssetIds`.
                // The PreviewModal and the re-run payload consume a single
                // GenerationConfig shape, so we flatten both paths here.
                const meta =
                  (asset.metadata && typeof asset.metadata === "object"
                    ? (asset.metadata as {
                        prompt?: string | null;
                        videoModel?: string | null;
                        duration?: number | null;
                        voiceoverText?: string | null;
                        musicPrompt?: string | null;
                        musicVolume?: number | null;
                        effectId?: string | null;
                        effectPhrases?: GenerationConfig["effectPhrases"];
                        referenceAssetIds?: string[];
                        engineRequest?: {
                          templateName?: string;
                          imageAssetIds?: string[];
                          voiceoverText?: string;
                          musicPrompt?: string;
                          musicVolume?: number;
                        };
                      })
                    : null) ?? null;
                let generationConfig: GenerationConfig | null = null;
                if (asset.tool_used === "video" && meta) {
                  generationConfig = {
                    prompt: meta.prompt ?? null,
                    videoModel: meta.videoModel ?? null,
                    duration: meta.duration ?? null,
                    voiceoverText:
                      meta.voiceoverText ??
                      meta.engineRequest?.voiceoverText ??
                      null,
                    musicPrompt:
                      meta.musicPrompt ??
                      meta.engineRequest?.musicPrompt ??
                      null,
                    musicVolume:
                      meta.musicVolume ??
                      meta.engineRequest?.musicVolume ??
                      null,
                    effectId: meta.effectId ?? null,
                    effectPhrases: meta.effectPhrases ?? null,
                  };
                }
                const toRef = (src: NonNullable<typeof assets>[number]): SourceAssetRef => ({
                  id: src.id,
                  originalUrl: src.original_url,
                  thumbnailUrl:
                    (src as { thumbnail_url?: string | null }).thumbnail_url ??
                    src.original_url,
                  assetType: (src.asset_type as "image" | "video") ?? "image",
                });
                const sourceAssets: SourceAssetRef[] = [];
                const primaryId = (asset as { source_asset_id?: string | null })
                  .source_asset_id;
                if (primaryId) {
                  const primary = assets?.find((a) => a.id === primaryId);
                  if (primary) sourceAssets.push(toRef(primary));
                }
                // Resolve the reference list, preferring the richer engine
                // payload (full ordered list incl. primary) and falling back
                // to the top-level referenceAssetIds that legacy runs wrote.
                // Strip the primary so the modal keeps it at index 0 without
                // duplicates.
                const engineImageIds = meta?.engineRequest?.imageAssetIds;
                const refIds =
                  Array.isArray(engineImageIds) && engineImageIds.length > 0
                    ? engineImageIds
                    : meta?.referenceAssetIds;
                if (Array.isArray(refIds)) {
                  const seen = new Set<string>(
                    primaryId ? [primaryId] : [],
                  );
                  for (const refId of refIds) {
                    if (seen.has(refId)) continue;
                    seen.add(refId);
                    const ref = assets?.find((a) => a.id === refId);
                    if (ref) sourceAssets.push(toRef(ref));
                  }
                }
                setPreviewAsset({
                  assetId: asset.id,
                  originalUrl: asset.original_url,
                  processedUrl: asset.processed_url,
                  assetType,
                  generationConfig,
                  sourceAssets,
                });
              }}
            />
          </motion.div>
        ))}
      </div>

      {videoModalAsset && (
        <VideoOptionsModal
          isOpen={!!videoModalAsset}
          onClose={() => setVideoModalAsset(null)}
          assetId={videoModalAsset.id}
          projectId={videoModalAsset.projectId}
        />
      )}

      {compareAsset && (
        <CompareModal
          isOpen={!!compareAsset}
          onClose={() => setCompareAsset(null)}
          originalUrl={compareAsset.originalUrl}
          processedUrl={compareAsset.processedUrl}
        />
      )}

      {previewAsset && (
        <PreviewModal
          assetId={previewAsset.assetId}
          isOpen={!!previewAsset}
          onClose={() => setPreviewAsset(null)}
          originalUrl={previewAsset.originalUrl}
          processedUrl={previewAsset.processedUrl}
          assetType={previewAsset.assetType}
          generationConfig={previewAsset.generationConfig}
          sourceAssets={previewAsset.sourceAssets}
          onRerun={
            onRerun &&
            previewAsset.generationConfig &&
            previewAsset.sourceAssets &&
            previewAsset.sourceAssets.length > 0
              ? () => {
                  const cfg = previewAsset.generationConfig!;
                  const allSources = previewAsset.sourceAssets!;
                  const [primary, ...rest] = allSources;
                  // Stored `cfg.duration` is the TOTAL video length from the
                  // original run, captured when N = allSources.length images
                  // were attached. We re-install all N images below, so this
                  // stays valid for Kling's [5N, 10N] range. CreationBar's
                  // clamp effect will still snap if the user later removes
                  // images or switches models.
                  const duration = cfg.duration ?? 5;
                  const model =
                    (cfg.videoModel as VideoModel | null | undefined) ??
                    "kling";
                  const toRerunRef = (s: SourceAssetRef) => ({
                    id: s.id,
                    originalUrl: s.originalUrl,
                    thumbnailUrl: s.thumbnailUrl ?? s.originalUrl,
                    assetType: s.assetType,
                  });
                  onRerun({
                    prompt: cfg.prompt ?? "",
                    videoModel: model,
                    duration,
                    voiceoverText: cfg.voiceoverText ?? undefined,
                    musicPrompt: cfg.musicPrompt ?? undefined,
                    musicVolume: cfg.musicVolume ?? undefined,
                    effectId: cfg.effectId ?? undefined,
                    sourceAsset: toRerunRef(primary),
                    referenceAssets:
                      rest.length > 0 ? rest.map(toRerunRef) : undefined,
                  });
                  setPreviewAsset(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
