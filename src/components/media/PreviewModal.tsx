"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, RotateCcw, X, Mic, Music, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GenerationConfig {
  prompt?: string | null;
  videoModel?: string | null;
  duration?: number | null;
  voiceoverText?: string | null;
  musicPrompt?: string | null;
  /** 0..1 (metadata scale) */
  musicVolume?: number | null;
}

export interface SourceAssetRef {
  id: string;
  originalUrl: string;
  thumbnailUrl?: string | null;
  assetType: "image" | "video";
}

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalUrl: string;
  processedUrl?: string | null;
  assetType?: "image" | "video";
  generationConfig?: GenerationConfig | null;
  /**
   * All source assets that went into the generation. Index 0 is the primary
   * (FK'd via `source_asset_id`); the rest are references (from
   * `metadata.referenceAssetIds`). Shown as a thumbnail strip.
   */
  sourceAssets?: SourceAssetRef[] | null;
  onRerun?: () => void;
}

type Tab = "original" | "enhanced";

const MODEL_LABELS: Record<string, string> = {
  kling: "Kling",
  seedance: "Seedance 2.0",
  "seedance-fast": "Seedance 2.0 Fast",
};

function hasAnyConfig(c?: GenerationConfig | null): boolean {
  if (!c) return false;
  return !!(
    c.prompt ||
    c.videoModel ||
    c.duration ||
    c.voiceoverText ||
    c.musicPrompt ||
    (c.musicVolume !== null && c.musicVolume !== undefined)
  );
}

function filenameFromUrl(url: string, assetType: "image" | "video"): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").filter(Boolean).pop();
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last;
  } catch {
    // fall through to default
  }
  const ext = assetType === "video" ? "mp4" : "jpg";
  return `reelio-${assetType}-${Date.now()}.${ext}`;
}

export function PreviewModal({
  isOpen,
  onClose,
  originalUrl,
  processedUrl,
  assetType = "image",
  generationConfig,
  sourceAssets,
  onRerun,
}: PreviewModalProps) {
  const hasBoth = !!originalUrl && !!processedUrl && assetType === "image";
  const sources = sourceAssets ?? [];
  const hasSources = sources.length > 0;
  const [activeTab, setActiveTab] = useState<Tab>("original");
  const [downloading, setDownloading] = useState(false);

  // Reset tab to original whenever modal opens
  useEffect(() => {
    if (isOpen) setActiveTab("original");
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // For generated videos, the placeholder asset row's `original_url` is the
  // SOURCE IMAGE (see api/process/route.ts:222 — "temporarily use source
  // image"); the real MP4 lives at `processed_url`. If we pass the image URL
  // to <video src>, the browser can't play it and renders no controls. So
  // for videos, always prefer `processedUrl` when present.
  const currentUrl =
    assetType === "video"
      ? processedUrl || originalUrl
      : hasBoth && activeTab === "enhanced"
        ? processedUrl!
        : originalUrl;

  // Fetch the asset as a blob and force a real file download. Using
  // `<a download>` alone fails for cross-origin URLs (R2's public CDN is
  // a different origin than the app) — browsers silently navigate instead
  // of downloading. Blob-fetch bypasses that.
  async function handleDownload() {
    if (!currentUrl || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(currentUrl, { mode: "cors", credentials: "omit" });
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filenameFromUrl(currentUrl, assetType);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke on the next tick so the browser has time to start the download.
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (err) {
      // Fallback: open in a new tab so the user can at least save manually.
      console.error("[preview] blob download failed, opening in tab", err);
      window.open(currentUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  const showDetails = hasAnyConfig(generationConfig) || hasSources;
  const modelLabel = generationConfig?.videoModel
    ? MODEL_LABELS[generationConfig.videoModel] ?? generationConfig.videoModel
    : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="preview-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="preview-panel"
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ duration: 0.22, ease: "easeOut" as const }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className={cn(
                "relative w-[calc(100%-2rem)] sm:w-full max-w-5xl mx-auto pointer-events-auto",
                "rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]",
                "shadow-[0_32px_80px_rgba(0,0,0,0.7)] p-3 sm:p-4 flex flex-col gap-3",
                // Flex layout: modal itself never scrolls. Header/details/
                // footer stay at natural heights (flex-shrink-0); the media
                // area shrinks first when the viewport is short so the
                // video's native control rail always stays visible.
                "max-h-[92vh] overflow-hidden"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header row: tabs (or title placeholder) + close button */}
              <div className="flex items-center justify-between gap-3 flex-shrink-0">
                {hasBoth ? (
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border)]">
                    {(["original", "enhanced"] as Tab[]).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "px-3 py-1 rounded-md text-xs font-medium transition-colors duration-150 capitalize",
                          activeTab === tab
                            ? "bg-[var(--color-accent)] text-[var(--color-background)]"
                            : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                        )}
                      >
                        {tab === "original" ? "Original" : "Enhanced"}
                      </button>
                    ))}
                  </div>
                ) : (
                  // Spacer so close button stays right-aligned
                  <div />
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)] transition-colors duration-150 flex-shrink-0"
                  aria-label="Close preview"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Media area — `flex-1 min-h-0` + cap at 55vh means the video
                  container grows to fill available vertical space (up to 55vh
                  on tall viewports) and shrinks when the viewport is short.
                  The video itself uses `h-full` so it actually fills the
                  shrinking container instead of overflowing it — which is
                  what kept the control rail off-screen before. */}
              {assetType === "video" ? (
                // No flex centering on the container — wrapping an
                // inline-display <video> in `flex items-center justify-center`
                // swallowed the controls rail on Chrome/Safari. The video is
                // a block child that fills the container via w-full h-full;
                // object-contain preserves aspect inside that box.
                <div className="w-full bg-black rounded-xl overflow-hidden flex-1 min-h-0 max-h-[55vh]">
                  <video
                    key={currentUrl}
                    src={currentUrl}
                    controls
                    playsInline
                    preload="metadata"
                    controlsList="nodownload"
                    className="block w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="bg-[var(--color-surface-raised)] rounded-xl overflow-hidden flex-1 min-h-0 max-h-[72vh] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={currentUrl}
                    src={currentUrl}
                    alt="Asset preview"
                    className="max-w-full max-h-full object-contain rounded-xl"
                  />
                </div>
              )}

              {/* Generation details (video history) — scrolls internally if
                  the prompt or sources list is long, so it never squeezes
                  the video out of view. */}
              {showDetails && (
                <div className="rounded-xl bg-[var(--color-surface-raised)] border border-[var(--color-border)] p-4 space-y-3 flex-shrink-0 max-h-[30vh] overflow-y-auto">
                  {generationConfig?.prompt && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                        Prompt
                      </p>
                      <p className="text-sm text-[var(--color-foreground)] whitespace-pre-wrap break-words leading-relaxed">
                        {generationConfig.prompt}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-muted)]">
                    {modelLabel && (
                      <div className="inline-flex items-center gap-1.5">
                        <Sparkles size={12} className="text-[var(--color-accent)]" />
                        <span className="text-[var(--color-foreground)] font-medium">
                          {modelLabel}
                        </span>
                      </div>
                    )}
                    {generationConfig?.duration != null && (
                      <div className="inline-flex items-center gap-1.5">
                        <Clock size={12} />
                        <span>{generationConfig.duration}s</span>
                      </div>
                    )}
                    {generationConfig?.voiceoverText && (
                      <div
                        className="inline-flex items-center gap-1.5 max-w-full"
                        title={generationConfig.voiceoverText}
                      >
                        <Mic size={12} />
                        <span className="truncate max-w-[240px]">
                          {generationConfig.voiceoverText}
                        </span>
                      </div>
                    )}
                    {generationConfig?.musicPrompt && (
                      <div
                        className="inline-flex items-center gap-1.5"
                        title={generationConfig.musicPrompt}
                      >
                        <Music size={12} />
                        <span className="truncate max-w-[200px]">
                          {generationConfig.musicPrompt}
                        </span>
                        {generationConfig.musicVolume != null && (
                          <span className="text-[var(--color-muted)]/70">
                            · {Math.round((generationConfig.musicVolume ?? 0) * 100)}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {hasSources && (
                    <div className="pt-3 border-t border-[var(--color-border)]">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-2">
                        {sources.length > 1
                          ? `Sources (${sources.length})`
                          : "Source"}
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {sources.map((src) => (
                          <div
                            key={src.id}
                            className="relative w-16 h-12 rounded-md overflow-hidden bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shrink-0"
                            title={`Original ${src.assetType}`}
                          >
                            {src.assetType === "video" ? (
                              <video
                                src={src.originalUrl}
                                muted
                                preload="metadata"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={src.thumbnailUrl ?? src.originalUrl}
                                alt="Source"
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Footer: download + (optional) re-run */}
              <div className="flex items-center justify-end gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                    "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                    "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:border-[var(--color-accent)]",
                    "transition-colors duration-150 disabled:opacity-60 disabled:cursor-wait"
                  )}
                >
                  <Download size={13} />
                  {downloading ? "Downloading…" : "Download"}
                </button>
                {onRerun && (
                  <button
                    type="button"
                    onClick={onRerun}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                      "bg-[var(--color-accent)] text-[var(--color-background)]",
                      "hover:brightness-110 transition-[filter] duration-150"
                    )}
                  >
                    <RotateCcw size={13} />
                    Re-run
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
