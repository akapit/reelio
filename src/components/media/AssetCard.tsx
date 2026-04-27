"use client";

import {
  Check,
  Download,
  Image as ImageIcon,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

type AssetStatus = "uploaded" | "processing" | "done" | "failed";
type AssetTool = "enhance" | "staging" | "sky" | "video";
type StatusLabelKey = "uploaded" | "processing" | "published" | "failed";

interface AssetCardProps {
  id: string;
  projectId: string;
  originalUrl: string;
  processedUrl?: string | null;
  status: AssetStatus;
  toolUsed?: AssetTool | null;
  assetType?: "image" | "video";
  thumbnailUrl?: string | null;
  onEnhance?: () => void;
  onGenerateVideo?: () => void;
  onCompare?: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  onPreview?: () => void;
  /**
   * Multi-select support. Two coordinates:
   *   • `isInSelectMode` — the grid-wide mode is active. When true we
   *     suppress ALL preview/modal opens on this card (even if the card
   *     itself isn't eligible to be picked, e.g. videos), hide hover
   *     action buttons, and disable drag. This prevents confusing
   *     dual-behavior while the user is choosing items.
   *   • `isSelectable` — this specific card can actually be toggled on/off
   *     (images are selectable, videos are not — the creator only accepts
   *     images). Drives the checkbox overlay and the click→toggle path.
   * Non-selectable cards in select mode render dimmed and do nothing on
   * click. Consumer (AssetGrid) manages both flags.
   */
  isInSelectMode?: boolean;
  isSelectable?: boolean;
  isSelected?: boolean;
  onSelectToggle?: () => void;
}

const statusConfig: Record<
  AssetStatus,
  { labelKey: StatusLabelKey; className: string; pulse?: boolean }
> = {
  uploaded: {
    labelKey: "uploaded",
    className:
      "bg-[var(--color-surface-raised)] text-[var(--color-muted)] border-[var(--color-border)]",
  },
  processing: {
    labelKey: "processing",
    className:
      "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/30",
    pulse: true,
  },
  done: {
    labelKey: "published",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  failed: {
    labelKey: "failed",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
  },
};

export function AssetCard({
  id,
  originalUrl,
  processedUrl,
  status,
  toolUsed,
  assetType = "image",
  thumbnailUrl,
  onEnhance,
  onGenerateVideo,
  onCompare,
  onDelete,
  onCancel,
  onPreview,
  isInSelectMode = false,
  isSelectable = false,
  isSelected = false,
  onSelectToggle,
}: AssetCardProps) {
  const { t } = useI18n();
  const statusMeta = statusConfig[status];
  const displayUrl = status === "done" && processedUrl ? processedUrl : originalUrl;
  // For card thumbnail: use thumbnailUrl if available (e.g. source image for videos)
  const thumbUrl = thumbnailUrl || displayUrl;
  // Hide hover action buttons and disable drag whenever select mode is on —
  // clicking must only toggle selection; any other interaction (preview,
  // enhance, generate-video, delete) would fight the user's intent.
  const showActionButtons =
    !isInSelectMode && (status === "uploaded" || status === "done");
  const showCompare = status === "done" && !!processedUrl && toolUsed === "enhance";
  const draggable =
    !isInSelectMode && (status === "uploaded" || status === "done");

  const handleCardClick = () => {
    if (isInSelectMode) {
      // Only selectable cards respond; non-selectable ones (videos) are a
      // no-op in select mode so the preview modal never opens.
      if (isSelectable) onSelectToggle?.();
      return;
    }
    onPreview?.();
  };

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/reelio-asset",
          JSON.stringify({ id, originalUrl: displayUrl, thumbnailUrl: thumbUrl, assetType })
        );
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl",
        "bg-[var(--color-surface)] border transition-[border-color,box-shadow,opacity] duration-200",
        isSelected
          ? "border-[var(--color-accent)] shadow-[0_0_0_2px_rgba(212,168,79,0.45),0_8px_32px_#d4a84f1a]"
          : "border-[var(--color-border)] hover:border-[var(--color-accent)]/30 hover:shadow-[0_0_0_1px_#d4a84f22,0_8px_32px_#d4a84f0a]",
        draggable && "cursor-grab active:cursor-grabbing",
        isSelectable && "cursor-pointer",
        // Dim cards that can't be picked while in select mode so the user
        // sees at a glance which cards the grid-wide action applies to.
        isInSelectMode && !isSelectable && "opacity-50",
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-[var(--color-surface-raised)] overflow-hidden">
        {status === "processing" ? (
          <>
            {/* Shimmer processing state — route click through handleCardClick
                so select mode suppresses the "Inspect run" preview too. */}
            <div
              onClick={handleCardClick}
              className="w-full h-full flex flex-col items-center justify-center gap-3"
              style={{
                background:
                  "linear-gradient(110deg, var(--color-surface) 30%, rgba(212,168,79,0.08) 50%, var(--color-surface) 70%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 2s ease-in-out infinite",
                cursor:
                  isInSelectMode || onPreview ? "pointer" : "default",
              }}
            >
              <Loader2 size={24} className="animate-spin text-[var(--color-muted)]" />
              <span className="text-xs text-[var(--color-muted)]">
                {toolUsed ? t.media.processingTools[toolUsed] : t.media.processing}
              </span>
              {onPreview && !isInSelectMode && (
                <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]/80">
                  {t.media.inspectRun}
                </span>
              )}
            </div>

            {/* Cancel button on hover.
                The wrapper is pointer-events-none so the shimmer div behind it
                still receives the click that opens the inspector. Only the
                button itself re-enables pointer events. */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <button
                type="button"
                title={t.media.cancelProcessing}
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel?.();
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium",
                  "bg-[var(--color-surface)]/90 backdrop-blur",
                  "border border-[var(--color-border)]",
                  "hover:border-red-500/50 transition-colors duration-150",
                  "text-[var(--color-muted)] hover:text-red-400",
                  "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                  "pointer-events-auto"
                )}
              >
                <Square size={10} className="fill-current" />
                {t.media.stop}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Clickable media area — preview click in normal mode, selection
                toggle in selection mode. Child action buttons stop propagation. */}
            <div
              className={cn(
                "w-full h-full",
                (onPreview || isSelectable) && "cursor-pointer",
              )}
              onClick={handleCardClick}
            >
              {assetType === "video" && !thumbnailUrl ? (
                <video
                  src={displayUrl}
                  className="w-full h-full object-cover"
                  muted
                  preload="metadata"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbUrl}
                  alt={assetType === "video" ? t.media.videoAsset : t.media.imageAsset}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
            </div>

            {/* Top-left overlay — selection checkbox in select mode, delete
                button otherwise. Only one shows at a time to avoid crowding. */}
            {isSelectable ? (
              <div
                className={cn(
                  "absolute top-2 start-2 z-10 pointer-events-none",
                )}
                aria-hidden
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-md flex items-center justify-center border",
                    "transition-colors duration-150",
                    isSelected
                      ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-background)]"
                      : "bg-[var(--color-surface)]/90 backdrop-blur border-[var(--color-border)] text-transparent",
                  )}
                >
                  <Check size={14} strokeWidth={3} />
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "absolute top-2 start-2 z-10",
                  "sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200"
                )}
              >
                <button
                  type="button"
                  title={t.media.deleteAsset}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.();
                  }}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    "bg-[var(--color-surface)]/90 backdrop-blur",
                    "border border-[var(--color-border)]",
                    "hover:border-red-500/50 transition-colors duration-150",
                    "text-[var(--color-muted)] hover:text-red-400"
                  )}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}

            {/* Action buttons overlay */}
            {showActionButtons && (
              <div
                className={cn(
                  "absolute top-2 end-2 z-10 flex items-center gap-1",
                  "sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200"
                )}
              >
                <button
                  type="button"
                  title={t.media.upgradeImage}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnhance?.();
                  }}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    "bg-[var(--color-surface)]/90 backdrop-blur",
                    "border border-[var(--color-border)]",
                    "hover:border-[var(--color-accent)] transition-colors duration-150",
                    "text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                  )}
                >
                  <Sparkles size={14} />
                </button>
                <button
                  type="button"
                  title={t.media.generateVideo}
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerateVideo?.();
                  }}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    "bg-[var(--color-surface)]/90 backdrop-blur",
                    "border border-[var(--color-border)]",
                    "hover:border-[var(--color-accent)] transition-colors duration-150",
                    "text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                  )}
                >
                  <Video size={14} />
                </button>
                <button
                  type="button"
                  title={t.media.download}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(displayUrl, "_blank");
                  }}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    "bg-[var(--color-surface)]/90 backdrop-blur",
                    "border border-[var(--color-border)]",
                    "hover:border-[var(--color-accent)] transition-colors duration-150",
                    "text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                  )}
                >
                  <Download size={14} />
                </button>
              </div>
            )}

            {/* Compare label */}
            {showCompare && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCompare?.();
                }}
                className="absolute bottom-2 start-2 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-black/60 text-[var(--color-accent)] backdrop-blur-sm hover:bg-black/80 transition-colors duration-150"
              >
                <SlidersHorizontal size={10} />
                {t.media.compare}
              </button>
            )}

            {/* Media-type indicator — icon-only so it stays legible without
                competing with the thumbnail. Needed for videos that use their
                source image as the poster. */}
            <span
              className={cn(
                "absolute bottom-2 end-2 z-10",
                "inline-flex items-center justify-center w-5 h-5 rounded-md",
                "bg-black/55 text-white backdrop-blur-sm",
                "pointer-events-none select-none",
              )}
              aria-label={assetType === "video" ? t.media.videoAsset : t.media.imageAsset}
              title={assetType === "video" ? t.media.video : t.media.image}
            >
              {assetType === "video" ? (
                <Video size={11} />
              ) : (
                <ImageIcon size={11} />
              )}
            </span>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-1.5 px-2.5 py-2 flex-wrap">
        {/* Status badge */}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
            statusMeta.className
          )}
        >
          {statusMeta.pulse && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent)] opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--color-accent)]" />
            </span>
          )}
          {t.status[statusMeta.labelKey]}
        </span>

        {/* Tool badge */}
        {toolUsed && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-surface-raised)] text-[var(--color-muted)] border border-[var(--color-border)]">
            {t.media.tools[toolUsed]}
          </span>
        )}
      </div>
    </div>
  );
}
