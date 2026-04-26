"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  Mic,
  Music,
  RotateCcw,
  Sparkles,
  Upload,
  Video,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getEffect } from "@/lib/media/effects/library";
import { useEngineRun } from "@/hooks/use-engine-run";

export interface GenerationConfig {
  prompt?: string | null;
  videoModel?: string | null;
  duration?: number | null;
  voiceoverText?: string | null;
  musicPrompt?: string | null;
  /** 0..1 (metadata scale) */
  musicVolume?: number | null;
  /** Stable id of the effect that was active at generation time. */
  effectId?: string | null;
  /** Full phrase snapshot — the actual strings applied. Snapshotted so
   * old generations stay reproducible even if the library changes. */
  effectPhrases?: {
    opener: string;
    transition?: string;
    closer?: string;
  } | null;
}

export interface SourceAssetRef {
  id: string;
  originalUrl: string;
  thumbnailUrl?: string | null;
  assetType: "image" | "video";
}

interface PreviewModalProps {
  assetId?: string;
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

const RUN_STATUS_META = {
  pending: {
    label: "Pending",
    icon: Clock3,
    className:
      "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]",
  },
  running: {
    label: "Running",
    icon: Loader2,
    className:
      "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)]",
  },
  done: {
    label: "Done",
    icon: CheckCircle2,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "border-red-500/30 bg-red-500/10 text-red-400",
  },
} as const;

function formatDurationMs(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatStepLabel(stepType: string): string {
  return stepType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function hasAnyConfig(c?: GenerationConfig | null): boolean {
  if (!c) return false;
  return !!(
    c.prompt ||
    c.videoModel ||
    c.duration ||
    c.voiceoverText ||
    c.musicPrompt ||
    (c.musicVolume !== null && c.musicVolume !== undefined) ||
    c.effectId ||
    c.effectPhrases
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
  assetId,
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
  const { data: engineData, isLoading: isEngineLoading } = useEngineRun(
    assetId,
    isOpen,
  );
  const engineRun = engineData?.run ?? null;
  const engineSteps = engineData?.steps ?? [];
  const engineScenes = engineData?.scenes ?? [];
  const engineAttempts = engineData?.attempts ?? [];
  const engineEvents = engineData?.events ?? [];

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
      ? processedUrl ?? null
      : hasBoth && activeTab === "enhanced"
        ? processedUrl!
        : originalUrl;

  // Fetch the asset as a blob and force a real file download. Using
  // `<a download>` alone fails for cross-origin URLs (R2's public CDN is
  // a different origin than the app) — browsers silently navigate instead
  // of downloading. Blob-fetch bypasses that.
  async function handleDownload() {
    const downloadUrl = currentUrl ?? originalUrl;
    if (!downloadUrl || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(downloadUrl, { mode: "cors", credentials: "omit" });
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filenameFromUrl(downloadUrl, assetType);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke on the next tick so the browser has time to start the download.
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (err) {
      // Fallback: open in a new tab so the user can at least save manually.
      console.error("[preview] blob download failed, opening in tab", err);
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  const sceneSteps = useMemo(
    () =>
      engineSteps.filter((step) => step.step_type === "scene_generate").sort((a, b) => a.step_order - b.step_order),
    [engineSteps],
  );
  const attemptsBySceneRecordId = useMemo(() => {
    const map = new Map<string, typeof engineAttempts>();
    for (const attempt of engineAttempts) {
      const current = map.get(attempt.scene_record_id) ?? [];
      current.push(attempt);
      map.set(attempt.scene_record_id, current);
    }
    for (const attempts of map.values()) {
      attempts.sort((a, b) => a.attempt_order - b.attempt_order);
    }
    return map;
  }, [engineAttempts]);
  const runStatusMeta = engineRun ? RUN_STATUS_META[engineRun.status] : null;
  const totalRunDuration = formatDurationMs(
    engineRun?.completed_at && engineRun.started_at
      ? new Date(engineRun.completed_at).getTime() -
          new Date(engineRun.started_at).getTime()
      : null,
  );
  const showDetails =
    hasAnyConfig(generationConfig) ||
    hasSources ||
    !!engineRun ||
    engineScenes.length > 0 ||
    sceneSteps.length > 0;
  const modelLabel = generationConfig?.videoModel
    ? MODEL_LABELS[generationConfig.videoModel] ?? generationConfig.videoModel
    : null;

  // Effect chip: prefer library lookup for a friendly name; fall back to
  // "Custom" if the id is stale (effect since removed) or only phrases were
  // persisted (anonymous effect). Tooltip surfaces the actual opener phrase
  // — snapshotted at generation time so it's accurate even after library edits.
  const effectFromLibrary = getEffect(generationConfig?.effectId);
  const hasAnyEffect =
    !!generationConfig?.effectId || !!generationConfig?.effectPhrases;
  const effectName = effectFromLibrary
    ? effectFromLibrary.name
    : hasAnyEffect
      ? "Custom"
      : null;
  const openerSnippet =
    generationConfig?.effectPhrases?.opener ?? effectFromLibrary?.openerPhrase;
  const effectTitle = openerSnippet
    ? `Opener: ${openerSnippet.length > 80 ? `${openerSnippet.slice(0, 80)}…` : openerSnippet}`
    : undefined;
  const RunStatusIcon = runStatusMeta?.icon;

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
                "relative w-[calc(100%-2rem)] sm:w-full max-w-[570px] mx-auto pointer-events-auto",
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
              {assetType === "video" && currentUrl ? (
                <div className="w-[490px] max-w-full mx-auto bg-black rounded-xl overflow-hidden flex-shrink-0">
                  <video
                    key={currentUrl}
                    src={currentUrl}
                    controls
                    playsInline
                    preload="metadata"
                    controlsList="nodownload"
                    className="block w-full max-h-[70vh] object-contain"
                  />
                </div>
              ) : (
                <div className="bg-[var(--color-surface-raised)] rounded-xl overflow-hidden flex-1 min-h-0 max-h-[72vh] flex items-center justify-center">
                  {assetType === "video" && !currentUrl ? (
                    <div className="w-full h-full min-h-[280px] flex flex-col items-center justify-center gap-3 text-center px-6">
                      <div className="w-12 h-12 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
                        <Video size={20} className="text-[var(--color-accent)]" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[var(--color-foreground)]">
                          Video is still processing
                        </p>
                        <p className="text-xs text-[var(--color-muted)] max-w-md">
                          The run timeline below shows the current stage, scene prompts, and any upstream task ids.
                        </p>
                      </div>
                      {sources[0] && (
                        <div className="w-36 h-24 rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={sources[0].thumbnailUrl ?? sources[0].originalUrl}
                            alt="Primary source"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={currentUrl ?? originalUrl}
                      src={currentUrl ?? originalUrl}
                      alt="Asset preview"
                      className="max-w-full max-h-full object-contain rounded-xl"
                    />
                  )}
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
                        <Clock3 size={12} />
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
                    {effectName && (
                      <div
                        className="inline-flex items-center gap-1.5"
                        title={effectTitle}
                      >
                        <Sparkles size={12} />
                        <span className="text-[var(--color-foreground)] font-medium">
                          Effect: {effectName}
                        </span>
                      </div>
                    )}
                  </div>

                  {engineRun && runStatusMeta && (
                    <div className="pt-3 border-t border-[var(--color-border)] space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                            runStatusMeta.className,
                          )}
                        >
                          {RunStatusIcon && (
                            <RunStatusIcon
                              size={12}
                              className={cn(engineRun.status === "running" && "animate-spin")}
                            />
                          )}
                          {runStatusMeta.label}
                        </span>
                        <span className="text-[11px] text-[var(--color-muted)]">
                          Run {engineRun.id.slice(0, 8)}
                        </span>
                        {typeof engineRun.input?.templateName === "string" && (
                          <span className="text-[11px] text-[var(--color-muted)]">
                            Template: {engineRun.input.templateName}
                          </span>
                        )}
                        {totalRunDuration && (
                          <span className="text-[11px] text-[var(--color-muted)]">
                            Total: {totalRunDuration}
                          </span>
                        )}
                      </div>

                      {typeof engineRun.error?.message === "string" && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-2 text-xs text-red-300">
                          {engineRun.error.message}
                        </div>
                      )}

                      {engineScenes.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                            Scenes
                          </p>
                          <div className="grid gap-2">
                            {engineScenes.map((scene) => {
                              const sceneStatusMeta =
                                RUN_STATUS_META[
                                  scene.status === "running"
                                    ? "running"
                                    : scene.status === "failed"
                                      ? "failed"
                                      : scene.status === "done"
                                        ? "done"
                                        : "pending"
                                ];
                              const SceneStatusIcon = sceneStatusMeta.icon;
                              const promptText =
                                typeof scene.prompt?.prompt === "string"
                                  ? scene.prompt.prompt
                                  : null;
                              const attempts =
                                attemptsBySceneRecordId.get(scene.id) ?? [];
                              const sceneOutput = scene.output ?? {};
                              const preparedSource =
                                sceneOutput.preparedSource as
                                  | Record<string, unknown>
                                  | undefined;
                              const crop = preparedSource?.crop as
                                | Record<string, unknown>
                                | undefined;
                              const evaluation = sceneOutput.evaluation as
                                | Record<string, unknown>
                                | undefined;
                              return (
                                <div
                                  key={scene.id}
                                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 space-y-2"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-xs font-medium text-[var(--color-foreground)]">
                                        Scene {scene.scene_order}
                                      </span>
                                      <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-[0.12em]">
                                        {scene.scene_role}
                                      </span>
                                      <span
                                        className={cn(
                                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                                          sceneStatusMeta.className,
                                        )}
                                      >
                                        <SceneStatusIcon
                                          size={10}
                                          className={cn(scene.status === "running" && "animate-spin")}
                                        />
                                        {sceneStatusMeta.label}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]">
                                      <span>{scene.room_type}</span>
                                      <span>{scene.duration_sec}s</span>
                                    </div>
                                  </div>

                                  {promptText && (
                                    <p className="text-xs text-[var(--color-foreground)] whitespace-pre-wrap break-words">
                                      {promptText}
                                    </p>
                                  )}

                                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]">
                                    {scene.motion_intent && <span>{scene.motion_intent}</span>}
                                    {typeof scene.prompt?.modelChoice === "string" && (
                                      <span>
                                        Model:{" "}
                                        {MODEL_LABELS[scene.prompt.modelChoice] ??
                                          scene.prompt.modelChoice}
                                      </span>
                                    )}
                                    {typeof scene.output?.videoUrl === "string" && (
                                      <span className="inline-flex items-center gap-1">
                                        <Upload size={10} />
                                        Clip ready
                                      </span>
                                    )}
                                    {typeof crop?.reason === "string" && (
                                      <span>
                                        Crop: {crop.reason}
                                      </span>
                                    )}
                                    {typeof evaluation?.score === "number" && (
                                      <span>
                                        QA:{" "}
                                        {Math.round(evaluation.score * 100)}
                                        %
                                      </span>
                                    )}
                                  </div>

                                  {typeof evaluation?.summary === "string" && (
                                    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2.5 py-2 text-[11px] text-[var(--color-muted)] space-y-1">
                                      <p className="text-[var(--color-foreground)]">
                                        {evaluation.summary}
                                      </p>
                                      {Array.isArray(evaluation.issues) &&
                                        evaluation.issues.length > 0 && (
                                          <p>
                                            Issues:{" "}
                                            {evaluation.issues.join(", ")}
                                          </p>
                                        )}
                                      {typeof sceneOutput.retryReason === "string" &&
                                        sceneOutput.retryReason && (
                                          <p>Retry reason: {sceneOutput.retryReason}</p>
                                        )}
                                    </div>
                                  )}

                                  {attempts.length > 0 && (
                                    <div className="space-y-1">
                                      {attempts.map((attempt) => {
                                        const attemptStatusMeta =
                                          RUN_STATUS_META[
                                            attempt.status === "running"
                                              ? "running"
                                              : attempt.status === "failed"
                                                ? "failed"
                                                : "done"
                                          ];
                                        const AttemptStatusIcon = attemptStatusMeta.icon;
                                        return (
                                          <div
                                            key={attempt.id}
                                            className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]"
                                          >
                                            <span className="text-[var(--color-foreground)] font-medium">
                                              Attempt {attempt.attempt_order}
                                            </span>
                                            <span
                                              className={cn(
                                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
                                                attemptStatusMeta.className,
                                              )}
                                            >
                                              <AttemptStatusIcon
                                                size={10}
                                                className={cn(attempt.status === "running" && "animate-spin")}
                                              />
                                              {attemptStatusMeta.label}
                                            </span>
                                            {attempt.provider && <span>{attempt.provider}</span>}
                                            {attempt.model_choice && (
                                              <span>
                                                {MODEL_LABELS[attempt.model_choice] ??
                                                  attempt.model_choice}
                                              </span>
                                            )}
                                            {typeof attempt.external_ids?.piapiTaskId ===
                                              "string" && (
                                              <span>
                                                Task {attempt.external_ids.piapiTaskId}
                                              </span>
                                            )}
                                            {typeof attempt.metrics?.generationMs ===
                                              "number" && (
                                              <span>
                                                {formatDurationMs(
                                                  attempt.metrics.generationMs,
                                                )}
                                              </span>
                                            )}
                                            {typeof attempt.metrics?.evaluationScore ===
                                              "number" && (
                                              <span>
                                                QA{" "}
                                                {Math.round(
                                                  attempt.metrics.evaluationScore * 100,
                                                )}
                                                %
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {typeof scene.error?.message === "string" && (
                                    <p className="text-[10px] text-red-300">
                                      {scene.error.message}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                          Pipeline
                        </p>
                        <div className="grid gap-2">
                        {engineSteps.map((step) => {
                          const stepStatusMeta =
                            RUN_STATUS_META[
                              step.status === "running"
                                ? "running"
                                : step.status === "failed"
                                  ? "failed"
                                  : "done"
                            ];
                          const stepDuration = formatDurationMs(
                            typeof step.metrics?.durationMs === "number"
                              ? step.metrics.durationMs
                              : step.completed_at
                                ? new Date(step.completed_at).getTime() -
                                  new Date(step.started_at).getTime()
                                : null,
                          );
                          const StepStatusIcon = stepStatusMeta.icon;
                          return (
                            <div
                              key={step.id}
                              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 space-y-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-[var(--color-foreground)]">
                                    {formatStepLabel(step.step_type)}
                                  </span>
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                                      stepStatusMeta.className,
                                    )}
                                  >
                                    {StepStatusIcon && (
                                      <StepStatusIcon
                                        size={10}
                                        className={cn(step.status === "running" && "animate-spin")}
                                      />
                                    )}
                                    {stepStatusMeta.label}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]">
                                  {typeof step.input?.sceneOrder === "number" && (
                                    <span>Scene {step.input.sceneOrder}</span>
                                  )}
                                  {stepDuration && <span>{stepDuration}</span>}
                                  {typeof step.external_ids?.piapiTaskId === "string" && (
                                    <span>Task {step.external_ids.piapiTaskId}</span>
                                  )}
                                  {typeof step.external_ids?.anthropicRequestId === "string" && (
                                    <span>Anthropic {step.external_ids.anthropicRequestId}</span>
                                  )}
                                </div>
                              </div>

                              {typeof step.input?.prompt === "string" && (
                                <p className="text-xs text-[var(--color-foreground)] whitespace-pre-wrap break-words">
                                  {step.input.prompt}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]">
                                {typeof step.input?.modelChoice === "string" && (
                                  <span>
                                    Model: {MODEL_LABELS[step.input.modelChoice] ?? step.input.modelChoice}
                                  </span>
                                )}
                                {typeof step.output?.videoUrl === "string" && (
                                  <span className="inline-flex items-center gap-1">
                                    <Upload size={10} />
                                    Clip ready
                                  </span>
                                )}
                                {typeof step.metrics?.generationMs === "number" && (
                                  <span>
                                    Generate: {formatDurationMs(step.metrics.generationMs)}
                                  </span>
                                )}
                              </div>

                              {typeof step.error?.message === "string" && (
                                <p className="text-[10px] text-red-300">
                                  {step.error.message}
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {!isEngineLoading && engineSteps.length === 0 && (
                          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)]">
                            No engine step records yet.
                          </div>
                        )}
                      </div>
                      </div>

                      {engineEvents.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                            Events
                          </p>
                          <div className="grid gap-2">
                            {engineEvents.slice(-12).map((event) => (
                              <div
                                key={event.id}
                                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[11px] text-[var(--color-muted)] space-y-1"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[var(--color-foreground)] font-medium">
                                      {formatStepLabel(event.event_type.replace(/\./g, "_"))}
                                    </span>
                                    <span
                                      className={cn(
                                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]",
                                        event.level === "error"
                                          ? "border-red-500/30 bg-red-500/10 text-red-300"
                                          : event.level === "warn"
                                            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                            : "border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-muted)]",
                                      )}
                                    >
                                      {event.level}
                                    </span>
                                  </div>
                                  {formatTimestamp(event.created_at) && (
                                    <span>{formatTimestamp(event.created_at)}</span>
                                  )}
                                </div>
                                {typeof event.payload?.message === "string" && (
                                  <p>{event.payload.message}</p>
                                )}
                                {typeof event.payload?.retryReason === "string" &&
                                  event.payload.retryReason && (
                                    <p>Retry: {event.payload.retryReason}</p>
                                  )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

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
