"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CheckCircle2,
  CheckSquare,
  Image as ImageIcon,
  Images,
  Plus,
  Video as VideoIcon,
  X,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

export interface AddToCreatorAsset {
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  assetType: "image" | "video";
}

interface AssetGridProps {
  projectId: string;
  onRerun?: (payload: Omit<RerunPayload, "nonce">) => void;
  /** When provided, shows a "Select" button that enables multi-select mode.
   *  Called with the selected assets when the user confirms the add. */
  onAddToCreator?: (assets: AddToCreatorAsset[]) => void;
}

type AssetTypeFilter = "all" | "image" | "video";
type AssetSortOrder = "newest" | "oldest";

export function AssetGrid({ projectId, onRerun, onAddToCreator }: AssetGridProps) {
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

  // Library controls — type filter + sort order. Defaults match the user's
  // expected "show everything, newest first" view. The useAssets hook already
  // orders by created_at desc, so sort=newest is just a passthrough; oldest
  // reverses the array in-place.
  const [typeFilter, setTypeFilter] = useState<AssetTypeFilter>("all");
  const [sortOrder, setSortOrder] = useState<AssetSortOrder>("newest");

  // Multi-select mode for bulk-adding assets to the creator bar. Videos are
  // not selectable — the creator only accepts images as source material.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelected = (assetId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const confirmAddToCreator = () => {
    if (!onAddToCreator || selectedIds.size === 0 || !assets) return;
    const picked: AddToCreatorAsset[] = [];
    for (const id of selectedIds) {
      const a = assets.find((x) => x.id === id);
      if (!a) continue;
      const kind = (a.asset_type as "image" | "video") ?? "image";
      if (kind === "video") continue;
      const thumb =
        (a as { thumbnail_url?: string | null }).thumbnail_url ??
        a.original_url;
      picked.push({
        id: a.id,
        originalUrl: a.original_url,
        thumbnailUrl: thumb,
        assetType: kind,
      });
    }
    if (picked.length === 0) {
      toast.error("Select at least one image to add.");
      return;
    }
    onAddToCreator(picked);
    toast.success(
      `${picked.length} ${picked.length === 1 ? "image" : "images"} added to creator`,
    );
    exitSelectionMode();
  };

  const visibleAssets = useMemo(() => {
    if (!assets) return assets;
    const filtered =
      typeFilter === "all"
        ? assets
        : assets.filter((a) => {
            const kind = (a.asset_type as "image" | "video") ?? "image";
            return kind === typeFilter;
          });
    if (sortOrder === "newest") return filtered;
    return [...filtered].reverse();
  }, [assets, typeFilter, sortOrder]);

  const counts = useMemo(() => {
    const base = { all: 0, image: 0, video: 0 };
    if (!assets) return base;
    for (const a of assets) {
      base.all++;
      const kind = (a.asset_type as "image" | "video") ?? "image";
      if (kind === "video") base.video++;
      else base.image++;
    }
    return base;
  }, [assets]);

  if (isLoading) {
    return (
      <div
        className="grid gap-3 mx-auto max-w-[948px]"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
      >
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
            Upload your first photo to get started.
          </p>
        </div>
      </motion.div>
    );
  }

  const filterTabs: Array<{
    id: AssetTypeFilter;
    label: string;
    count: number;
    icon?: React.ReactNode;
  }> = [
    { id: "all", label: "All", count: counts.all },
    { id: "image", label: "Images", count: counts.image, icon: <ImageIcon size={12} /> },
    { id: "video", label: "Videos", count: counts.video, icon: <VideoIcon size={12} /> },
  ];

  return (
    <>
      {/* Everything aligned to the 5-col grid width (5 × 180px + 4 × 12px gap
          = 948px). The toolbar, selection bar, and empty-filter state all live
          inside this wrapper so their edges line up with the grid's. */}
      <div className="mx-auto max-w-[948px]">
      {/* Toolbar — type filter (left) + sort order (right). */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div
          className="inline-flex items-center gap-1 rounded-lg p-0.5 bg-[var(--color-surface)] border border-[var(--color-border)]"
          role="tablist"
          aria-label="Filter assets by type"
        >
          {filterTabs.map((tab) => {
            const active = typeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTypeFilter(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md",
                  "text-xs font-medium transition-colors duration-150 outline-none",
                  active
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]",
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "tabular-nums text-[10px]",
                    active
                      ? "text-[var(--color-accent)]/80"
                      : "text-[var(--color-muted)]/70",
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="inline-flex items-center gap-1.5">
          {onAddToCreator && (
            <button
              type="button"
              onClick={() => {
                if (selectionMode) exitSelectionMode();
                else setSelectionMode(true);
              }}
              title={
                selectionMode
                  ? "Cancel multi-select"
                  : "Multi-select to add images to the creator"
              }
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md",
                "text-xs font-medium transition-colors duration-150 outline-none",
                "border",
                selectionMode
                  ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/35"
                  : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-raised)]",
              )}
            >
              {selectionMode ? <X size={12} /> : <CheckSquare size={12} />}
              <span>{selectionMode ? "Cancel" : "Select"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setSortOrder((s) => (s === "newest" ? "oldest" : "newest"))
            }
            title={
              sortOrder === "newest"
                ? "Sorted by newest first — click for oldest first"
                : "Sorted by oldest first — click for newest first"
            }
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md",
              "text-xs font-medium transition-colors duration-150 outline-none",
              "text-[var(--color-muted)] hover:text-[var(--color-foreground)]",
              "bg-[var(--color-surface)] border border-[var(--color-border)]",
              "hover:bg-[var(--color-surface-raised)]",
            )}
          >
            {sortOrder === "newest" ? (
              <ArrowDownWideNarrow size={12} />
            ) : (
              <ArrowUpWideNarrow size={12} />
            )}
            <span>{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
          </button>
        </div>
      </div>

      {/* Selection action bar — appears while in select mode. Shows the
          running count and a primary Add button + a quick Select-all helper. */}
      {selectionMode && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" as const }}
          className={cn(
            "mb-3 flex items-center justify-between gap-3 flex-wrap",
            "rounded-lg px-3 py-2",
            "bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/25",
          )}
          role="toolbar"
          aria-label="Selection actions"
        >
          <div className="inline-flex items-center gap-2 text-xs">
            <CheckCircle2
              size={14}
              className="text-[var(--color-accent)] shrink-0"
            />
            <span className="font-medium text-[var(--color-foreground)] tabular-nums">
              {selectedIds.size}
              {selectedIds.size === 1 ? " image" : " images"} selected
            </span>
            <button
              type="button"
              onClick={() => {
                const imgIds = (visibleAssets ?? [])
                  .filter(
                    (a) =>
                      ((a.asset_type as "image" | "video") ?? "image") ===
                      "image",
                  )
                  .map((a) => a.id);
                setSelectedIds(new Set(imgIds));
              }}
              className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] underline-offset-2 hover:underline"
            >
              Select all
            </button>
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] underline-offset-2 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={confirmAddToCreator}
            disabled={selectedIds.size === 0}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md",
              "text-xs font-medium transition-all duration-150 outline-none",
              selectedIds.size === 0
                ? "bg-[var(--color-surface-raised)] text-[var(--color-muted)]/50 cursor-not-allowed"
                : "bg-[var(--color-accent)] text-[var(--color-background)] hover:brightness-110",
            )}
          >
            <Plus size={13} />
            <span>
              Add {selectedIds.size > 0 ? selectedIds.size : ""} to creator
            </span>
          </button>
        </motion.div>
      )}

      {visibleAssets && visibleAssets.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 h-32 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]"
          role="status"
        >
          <p className="text-sm text-[var(--color-muted)]">
            No {typeFilter === "video" ? "videos" : typeFilter === "image" ? "images" : "assets"}{" "}
            match this filter.
          </p>
        </div>
      ) : null}

      {/* Responsive grid: each track is at least 160px wide, stretches up to
          1fr. Combined with the 948px wrapper cap above, this yields 5 cols
          × ~180px on desktop, 4 cols at ~tablet, 3 at narrow tablet, 2 on
          phones — without ever leaving awkward empty gutters. */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
      >
        {(visibleAssets ?? []).map((asset, index) => {
          const assetKind =
            (asset.asset_type as "image" | "video") ?? "image";
          const selectableHere =
            selectionMode && assetKind === "image";
          return (
          <motion.div
            key={asset.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.04 }}
          >
            <AssetCard
              id={asset.id}
              projectId={projectId}
              isInSelectMode={selectionMode}
              isSelectable={selectableHere}
              isSelected={selectableHere && selectedIds.has(asset.id)}
              onSelectToggle={
                selectableHere ? () => toggleSelected(asset.id) : undefined
              }
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
          );
        })}
      </div>
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
