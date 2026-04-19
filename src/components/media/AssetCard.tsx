"use client";

import { Download, Loader2, SlidersHorizontal, Sparkles, Square, Trash2, Video } from "lucide-react";
import { cn } from "@/lib/utils";

type AssetStatus = "uploaded" | "processing" | "done" | "failed";
type AssetTool = "enhance" | "staging" | "sky" | "video";

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
}

const statusConfig: Record<
  AssetStatus,
  { label: string; className: string; pulse?: boolean }
> = {
  uploaded: {
    label: "Uploaded",
    className:
      "bg-[var(--color-surface-raised)] text-[var(--color-muted)] border-[var(--color-border)]",
  },
  processing: {
    label: "Processing",
    className:
      "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/30",
    pulse: true,
  },
  done: {
    label: "Done",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
  },
};

const toolLabels: Record<AssetTool, string> = {
  enhance: "Enhance",
  staging: "Staging",
  sky: "Sky Swap",
  video: "Video",
};

const processingLabels: Record<AssetTool, string> = {
  enhance: "Enhancing...",
  staging: "Staging...",
  sky: "Replacing sky...",
  video: "Generating video...",
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
}: AssetCardProps) {
  const statusMeta = statusConfig[status];
  const displayUrl = status === "done" && processedUrl ? processedUrl : originalUrl;
  // For card thumbnail: use thumbnailUrl if available (e.g. source image for videos)
  const thumbUrl = thumbnailUrl || displayUrl;
  const showActionButtons = status === "uploaded" || status === "done";
  const showCompare = status === "done" && !!processedUrl && toolUsed === "enhance";

  return (
    <div
      draggable={status === "uploaded" || status === "done"}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/reelio-asset",
          JSON.stringify({ id, originalUrl: displayUrl, thumbnailUrl: thumbUrl, assetType })
        );
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl",
        "bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/30",
        "hover:shadow-[0_0_0_1px_#c9a84c22,0_8px_32px_#c9a84c0a]",
        "transition-[border-color,box-shadow] duration-200",
        (status === "uploaded" || status === "done") && "cursor-grab active:cursor-grabbing"
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-[var(--color-surface-raised)] overflow-hidden">
        {status === "processing" ? (
          <>
            {/* Shimmer processing state */}
            <div
              onClick={() => onPreview?.()}
              className="w-full h-full flex flex-col items-center justify-center gap-3"
              style={{
                background:
                  "linear-gradient(110deg, var(--color-surface) 30%, rgba(201,168,76,0.08) 50%, var(--color-surface) 70%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 2s ease-in-out infinite",
                cursor: onPreview ? "pointer" : "default",
              }}
            >
              <Loader2 size={24} className="animate-spin text-[var(--color-muted)]" />
              <span className="text-xs text-[var(--color-muted)]">
                {toolUsed ? processingLabels[toolUsed] : "Processing..."}
              </span>
              {onPreview && (
                <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]/80">
                  Inspect run
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
                title="Cancel processing"
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
                Stop
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Clickable media area — calls onPreview; action buttons stop propagation */}
            <div
              className={cn("w-full h-full", onPreview && "cursor-pointer")}
              onClick={() => onPreview?.()}
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
                  alt="Asset"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
            </div>

            {/* Delete button overlay */}
            <div
              className={cn(
                "absolute top-2 left-2 z-10",
                "sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200"
              )}
            >
              <button
                type="button"
                title="Remove asset"
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

            {/* Action buttons overlay */}
            {showActionButtons && (
              <div
                className={cn(
                  "absolute top-2 right-2 z-10 flex items-center gap-1",
                  "sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200"
                )}
              >
                <button
                  type="button"
                  title="Enhance Photo"
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
                  title="Generate Video"
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
                  title="Download"
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
                className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-black/60 text-[var(--color-accent)] backdrop-blur-sm hover:bg-black/80 transition-colors duration-150"
              >
                <SlidersHorizontal size={10} />
                Compare
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
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
          {statusMeta.label}
        </span>

        {/* Tool badge */}
        {toolUsed && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-surface-raised)] text-[var(--color-muted)] border border-[var(--color-border)]">
            {toolLabels[toolUsed]}
          </span>
        )}
      </div>
    </div>
  );
}
