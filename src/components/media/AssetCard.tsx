"use client";

import { Download, SlidersHorizontal, Sparkles, Square, Trash2, Video } from "lucide-react";
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

export function AssetCard({
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
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl",
        "bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/30",
        "hover:shadow-[0_0_0_1px_#c9a84c22,0_8px_32px_#c9a84c0a]",
        "transition-[border-color,box-shadow] duration-200"
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-[var(--color-surface-raised)] overflow-hidden">
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
        {status !== "processing" && (
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
        )}

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

        {/* Processing overlay with cancel */}
        {status === "processing" && (
          <div className="absolute inset-0 bg-[var(--color-accent)]/5 animate-pulse flex items-center justify-center">
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
                "opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              )}
            >
              <Square size={10} className="fill-current" />
              Stop
            </button>
          </div>
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
