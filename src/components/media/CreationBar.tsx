"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Video,
  Paperclip,
  X,
  Loader2,
  Send,
  Mic,
  Music,
  Image as ImageIcon,
  Wand2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpload } from "@/hooks/use-upload";
import { useProcess } from "@/hooks/use-process";
import { useEngineGenerate } from "@/hooks/use-engine-generate";
import { toast } from "sonner";
import type { VideoModel } from "@/lib/media/types";
import { useI18n } from "@/lib/i18n/client";
import { TEMPLATE_ASPECT_RATIO } from "@/lib/engine/models";
import {
  AspectRatioWarningModal,
  type AspectRatioMismatch,
} from "@/components/media/AspectRatioWarningModal";

/**
 * Minimum source-image count required to kick off a video generation. Matches
 * the luxury_30s template's `minUsableImages` in
 * src/lib/engine/templates/luxury_30s.json. If we drop below this the planner
 * starts trimming slots, so we gate the UI here rather than let the server
 * produce a shorter-than-intended cut.
 */
const MIN_IMAGES_FOR_VIDEO = 6;

/** The only template surfaced in the UI today. See engine/templates/luxury_30s.json. */
const ENGINE_TEMPLATE = "luxury_30s" as const;

export interface RerunAssetRef {
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  assetType: "image" | "video";
}

/**
 * Payload the project page hands to CreationBar when the user clicks "Re-run"
 * on a past or in-flight generation. The `videoModel`/`duration`/`effectId`
 * fields are retained for backwards-compat with older asset metadata, but are
 * no longer consumed by the simplified bar — engine runs always use the
 * luxury template and server-side model defaults.
 */
export interface RerunPayload {
  /** Monotonic nonce — change it to signal a fresh preload. */
  nonce: number;
  prompt: string;
  /** @deprecated Not consumed by CreationBar anymore; kept for payload compat. */
  videoModel: VideoModel;
  /** @deprecated Not consumed by CreationBar anymore; kept for payload compat. */
  duration: number;
  voiceoverText?: string;
  musicPrompt?: string;
  /** 0..1 (same scale as stored in metadata) */
  musicVolume?: number;
  /** The primary source image (FK'd via `source_asset_id`). */
  sourceAsset: RerunAssetRef;
  /** Additional reference images. Primary stays at index 0 when reattached. */
  referenceAssets?: RerunAssetRef[];
  /** @deprecated Effects are gone from the UI. */
  effectId?: string;
}

/**
 * Payload for bulk-adding pre-uploaded assets into the bar without triggering
 * a full rerun rehydration. The `nonce` is monotonic — bump it to push the
 * same `assets` in again. Used by the asset library's multi-select flow so
 * users don't have to drag images one at a time.
 */
export interface AddAssetsPayload {
  nonce: number;
  assets: Array<{
    id: string;
    originalUrl: string;
    thumbnailUrl: string;
    assetType: "image" | "video";
  }>;
}

interface CreationBarProps {
  projectId: string;
  preload?: RerunPayload | null;
  addAssets?: AddAssetsPayload | null;
  /**
   * Fires whenever the set of attached existing-asset IDs changes (drag-drop,
   * `addAssets`, `preload`, manual remove, submit-clear). Lets parents mirror
   * what's currently in the bar so they can dedupe their own "Add" actions
   * and skip redundant toasts.
   */
  onExistingAssetsChange?: (ids: string[]) => void;
  /**
   * "horizontal" (default) is the original wide centered bar with `max-w-4xl`
   * and a single-row action footer. "vertical" stretches to its container,
   * stacks the action footer, and renders Generate full-width — used inside
   * the property-detail creator rail (~360–400px). Only layout/className
   * branches differ; every handler, effect, and piece of state is shared.
   */
  variant?: "horizontal" | "vertical";
}

interface PendingFile {
  file: File;
  preview: string;
  uploadedAssetId: string | null;
  isUploading: boolean;
}

interface ExistingAsset {
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  assetType: "image" | "video";
}

type CreationMode = "enhance" | "video" | null;

// The creation box only accepts images — both the enhance tools and the
// scene-based video engine ingest photos only. Dropping a video here would
// silently fail downstream, so we reject it at the boundary with a toast.
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|gif|heic)$/i;

export function CreationBar({
  projectId,
  preload,
  addAssets,
  onExistingAssetsChange,
  variant = "horizontal",
}: CreationBarProps) {
  const isVertical = variant === "vertical";
  const { t } = useI18n();
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [existingAssets, setExistingAssets] = useState<ExistingAsset[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [mode, setMode] = useState<CreationMode>(null);

  const [generatingScript, setGeneratingScript] = useState(false);

  const [voiceoverEnabled, setVoiceoverEnabled] = useState(false);
  const [voiceoverText, setVoiceoverText] = useState("");
  /**
   * Short subject blurb used as the seed for the voiceover-script generator.
   * Lives inside the voiceover panel so it's only visible when the user has
   * actually opted into narration — replaces the old main-prompt-as-seed
   * wiring, which was misleading because nothing else consumed that field in
   * engine mode.
   */
  const [voiceoverSubject, setVoiceoverSubject] = useState("");
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState(
    "Soft ambient piano, luxury real estate"
  );
  // 0..100 in UI; divided by 100 when sent server-side.
  const [musicVolume, setMusicVolume] = useState(20);

  // @-mention autocomplete state. `startIndex` is the position of the '@' in `prompt`.
  const [mention, setMention] = useState<{
    open: boolean;
    query: string;
    startIndex: number;
    activeIndex: number;
  }>({ open: false, query: "", startIndex: -1, activeIndex: 0 });

  // AR-mismatch confirm modal state. Populated by `handleSubmit` when the
  // pre-flight check finds source images whose orientation conflicts with the
  // target template. `pendingSubmit` carries the deferred engine.mutate call so
  // "Generate anyway" doesn't have to re-derive the request body.
  const [arWarning, setArWarning] = useState<{
    open: boolean;
    mismatches: AspectRatioMismatch[];
    targetAspectRatio: "16:9" | "9:16" | "1:1";
  } | null>(null);
  const [arCheckPending, setArCheckPending] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const upload = useUpload(projectId);
  const process = useProcess();
  const engine = useEngineGenerate();

  const uploadedAssetIds = useMemo(
    () => [
      ...pendingFiles
        .map((f) => f.uploadedAssetId)
        .filter((id): id is string => id !== null),
      ...existingAssets.map((a) => a.id),
    ],
    [pendingFiles, existingAssets],
  );

  const isUploading = pendingFiles.some((f) => f.isUploading);
  const hasAssets = uploadedAssetIds.length > 0;
  const isSubmitting = arCheckPending;

  // Video requires ≥ MIN_IMAGES_FOR_VIDEO for the scene engine. Enhance
  // requires ≥ 1. Show the gate inline under the thumbnail strip and
  // disable submit until it's met.
  const videoMinImages = MIN_IMAGES_FOR_VIDEO;
  const videoImageShortfall = Math.max(
    0,
    videoMinImages - uploadedAssetIds.length,
  );
  const videoGateMet = mode !== "video" || videoImageShortfall === 0;
  const canSubmit =
    hasAssets && !isUploading && !isSubmitting && mode !== null && videoGateMet;
  const sourceStatusText = isUploading
    ? t.creation.uploadingSourcePhotos
    : hasAssets
      ? `${uploadedAssetIds.length} ${
          uploadedAssetIds.length === 1
            ? t.creation.sourcePhotoReady
            : t.creation.sourcePhotosReady
        }`
      : t.creation.noSourcePhotos;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [prompt]);

  // Mirror existing-asset IDs to the parent so it can dedupe its own "Add"
  // actions (e.g. suppress redundant toasts when the user re-adds a photo
  // they've already dragged in).
  useEffect(() => {
    onExistingAssetsChange?.(existingAssets.map((a) => a.id));
  }, [existingAssets, onExistingAssetsChange]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      pendingFiles.forEach((f) => URL.revokeObjectURL(f.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preload from a "Re-run" click on a past or in-flight generation. Keyed on
  // `nonce` so the same payload can be reapplied by bumping the nonce from
  // the parent. Model/duration/effect fields on the payload are ignored —
  // the simplified bar has no UI for them and the server picks defaults.
  useEffect(() => {
    if (!preload) return;
    setPendingFiles((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.preview));
      return [];
    });
    const reattachedAssets = [
      preload.sourceAsset,
      ...(preload.referenceAssets ?? []),
    ];
    setExistingAssets(reattachedAssets);
    setMode("video");
    // Note: we intentionally no longer restore `preload.prompt` — the main
    // prompt textarea is hidden in video mode, and engine runs never consumed
    // it anyway. The rerun payload keeps the field for backwards-compat.
    setPrompt("");
    setVoiceoverSubject("");
    if (preload.voiceoverText) {
      setVoiceoverEnabled(true);
      setVoiceoverText(preload.voiceoverText);
    } else {
      setVoiceoverEnabled(false);
      setVoiceoverText("");
    }
    if (preload.musicPrompt) {
      setMusicEnabled(true);
      setMusicPrompt(preload.musicPrompt);
      if (preload.musicVolume != null) {
        setMusicVolume(Math.round(preload.musicVolume * 100));
      }
    } else {
      setMusicEnabled(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preload?.nonce]);

  // Bulk-add from the asset library's multi-select flow. Unlike `preload`,
  // this is additive — it only appends unique assets, never resets state.
  // Videos are rejected at this boundary too (the creator only accepts images
  // as source material).
  useEffect(() => {
    if (!addAssets || addAssets.assets.length === 0) return;
    const onlyImages = addAssets.assets.filter(
      (a) => a.assetType !== "video",
    );
    if (onlyImages.length === 0) {
      toast.error(t.creation.noVideosAsSource);
      return;
    }
    setExistingAssets((prev) => {
      const existing = new Set(prev.map((a) => a.id));
      const merged = [...prev];
      for (const a of onlyImages) {
        if (existing.has(a.id)) continue;
        existing.add(a.id);
        merged.push(a);
      }
      return merged;
    });
    setMode((prev) => prev ?? "video");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAssets?.nonce]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const all = Array.from(files);
      let accepted = all.filter((f) => ACCEPTED_EXTENSIONS.test(f.name));
      if (accepted.length === 0) {
        if (all.length > 0) {
          toast.error(t.creation.imageFilesOnly);
        }
        return;
      }
      if (accepted.length < all.length) {
        const rejected = all.length - accepted.length;
        toast.warning(
          `${rejected} ${rejected === 1 ? t.creation.fileSkipped : t.creation.filesSkipped}. ${t.creation.onlyImagesAccepted}`,
        );
      }

      // Default to "video" mode the moment the first asset lands and no
      // mode has been chosen.
      setMode((prev) => prev ?? "video");

      const newPending: PendingFile[] = accepted.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        uploadedAssetId: null,
        isUploading: true,
      }));

      setPendingFiles((prev) => [...prev, ...newPending]);

      accepted.forEach((file) => {
        upload.mutateAsync(file).then(
          (data) => {
            setPendingFiles((prev) =>
              prev.map((pf) =>
                pf.file === file
                  ? { ...pf, uploadedAssetId: data.id, isUploading: false }
                  : pf
              )
            );
          },
          () => {
            setPendingFiles((prev) => {
              const removed = prev.find((pf) => pf.file === file);
              if (removed) URL.revokeObjectURL(removed.preview);
              return prev.filter((pf) => pf.file !== file);
            });
          }
        );
      });
    },
    [upload, mode, t]
  );

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const clearAll = useCallback(() => {
    setPendingFiles((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.preview));
      return [];
    });
    setExistingAssets([]);
    setPrompt("");
    setMode(null);
    setVoiceoverEnabled(false);
    setVoiceoverText("");
    setVoiceoverSubject("");
    setMusicEnabled(false);
    setMusicPrompt("Soft ambient piano, luxury real estate");
    setMusicVolume(20);
  }, []);

  // Drag & drop
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const assetData = e.dataTransfer.getData("application/reelio-asset");
      if (assetData) {
        try {
          const asset: ExistingAsset = JSON.parse(assetData);
          if (asset.assetType === "video") {
            toast.error(t.creation.noVideosDrop);
            return;
          }
          setExistingAssets((prev) => {
            if (prev.some((a) => a.id === asset.id)) return prev;
            return [...prev, asset];
          });
          setMode((prev) => prev ?? "video");
          return;
        } catch {
          /* fall through */
        }
      }
      addFiles(e.dataTransfer.files);
    },
    [addFiles, t]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files);
      e.target.value = "";
    },
    [addFiles]
  );

  // @-mention: the complete set of valid mention tokens (image1..imageN)
  const totalImages = existingAssets.length + pendingFiles.length;
  const mentionSuggestions = useMemo(() => {
    const all = Array.from({ length: totalImages }, (_, i) => `image${i + 1}`);
    if (!mention.query) return all;
    const q = mention.query.toLowerCase();
    return all.filter((name) => name.toLowerCase().startsWith(q));
  }, [totalImages, mention.query]);

  const closeMention = useCallback(() => {
    setMention({ open: false, query: "", startIndex: -1, activeIndex: 0 });
  }, []);

  const detectMention = useCallback(
    (value: string, caret: number) => {
      let i = caret - 1;
      while (i >= 0) {
        const ch = value[i];
        if (ch === "@") {
          const prev = value[i - 1];
          const atBoundary = i === 0 || !prev || /\s/.test(prev);
          const query = value.slice(i + 1, caret);
          if (atBoundary && /^[a-zA-Z0-9]*$/.test(query)) {
            setMention((prevState) => ({
              open: true,
              query,
              startIndex: i,
              activeIndex:
                prevState.startIndex === i ? prevState.activeIndex : 0,
            }));
            return;
          }
          break;
        }
        if (/\s/.test(ch)) break;
        i--;
      }
      closeMention();
    },
    [closeMention]
  );

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);
      const caret = e.target.selectionStart ?? value.length;
      detectMention(value, caret);
    },
    [detectMention]
  );

  const applyMention = useCallback(
    (name: string) => {
      const el = textareaRef.current;
      if (!el || mention.startIndex < 0) return;
      const caret = el.selectionStart ?? prompt.length;
      const before = prompt.slice(0, mention.startIndex);
      const after = prompt.slice(caret);
      const insertion = `@${name} `;
      const next = before + insertion + after;
      const newCaret = before.length + insertion.length;
      setPrompt(next);
      closeMention();
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(newCaret, newCaret);
      });
    },
    [mention.startIndex, prompt, closeMention]
  );

  const handlePromptKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mention.open || mentionSuggestions.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMention((s) => ({
          ...s,
          activeIndex: (s.activeIndex + 1) % mentionSuggestions.length,
        }));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMention((s) => ({
          ...s,
          activeIndex:
            (s.activeIndex - 1 + mentionSuggestions.length) %
            mentionSuggestions.length,
        }));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const pick = mentionSuggestions[mention.activeIndex] ?? mentionSuggestions[0];
        if (pick) applyMention(pick);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeMention();
      }
    },
    [mention.open, mention.activeIndex, mentionSuggestions, applyMention, closeMention]
  );

  // Kicks off the actual engine generation. Pulled out of `handleSubmit` so
  // both the happy path and the "Generate anyway" branch from the AR-mismatch
  // modal go through the same code, and so we can keep `handleSubmit` async
  // for the pre-flight check without making the modal callback awkward.
  const submitVideoGeneration = useCallback(() => {
    if (uploadedAssetIds.length === 0) return;
    engine.mutate({
      projectId,
      imageAssetIds: uploadedAssetIds,
      templateName: ENGINE_TEMPLATE,
      voiceoverText: voiceoverEnabled
        ? voiceoverText.trim() || undefined
        : undefined,
      ...(musicEnabled
        ? { musicPrompt: musicPrompt.trim() || undefined }
        : {}),
      musicVolume: musicEnabled ? musicVolume / 100 : undefined,
    });
    clearAll();
  }, [
    uploadedAssetIds,
    engine,
    projectId,
    voiceoverEnabled,
    voiceoverText,
    musicEnabled,
    musicPrompt,
    musicVolume,
    clearAll,
  ]);

  // Submit
  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    if (mode === "enhance") {
      uploadedAssetIds.forEach((assetId) => {
        process.mutate({ assetId, projectId, tool: "enhance" });
      });
      toast.success(
        `${t.creation.enhance} ${uploadedAssetIds.length} ${t.creation.images}`
      );
      clearAll();
      return;
    }

    if (mode === "video") {
      if (uploadedAssetIds.length === 0) return;

      // Pre-flight aspect-ratio check. The engine silently center-crops AR
      // mismatches (a 9:16 phone shot inside a 16:9 template gets the top and
      // bottom chopped off), so warn the user before they burn provider
      // credits. The check fails open: any error → proceed without warning,
      // since blocking on a network blip would be worse UX than skipping the
      // safety net.
      const targetAspectRatio = TEMPLATE_ASPECT_RATIO[ENGINE_TEMPLATE];
      setArCheckPending(true);
      try {
        const res = await fetch("/api/assets/check-aspect-ratio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetIds: uploadedAssetIds,
            targetAspectRatio,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            mismatches?: AspectRatioMismatch[];
          };
          if (data.mismatches && data.mismatches.length > 0) {
            setArWarning({
              open: true,
              mismatches: data.mismatches,
              targetAspectRatio,
            });
            return;
          }
        } else {
          console.warn(
            "[creation-bar] AR check failed",
            res.status,
            await res.text().catch(() => ""),
          );
        }
      } catch (err) {
        console.warn("[creation-bar] AR check threw, failing open", err);
      } finally {
        setArCheckPending(false);
      }

      submitVideoGeneration();
    }
  }, [
    canSubmit,
    mode,
    uploadedAssetIds,
    process,
    projectId,
    clearAll,
    t,
    submitVideoGeneration,
  ]);

  const toggleMode = (m: CreationMode) => {
    setMode((prev) => (prev === m ? null : m));
  };

  return (
    <>
    <motion.div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      animate={{
        borderColor: isDragOver
          ? "var(--color-accent)"
          : isVertical
            ? "var(--line-soft)"
            : "rgba(212,168,79,0.5)",
        backgroundColor: isDragOver
          ? "rgba(212,168,79,0.04)"
          : isVertical
            ? "var(--bg-1)"
            : "var(--color-surface)",
      }}
      transition={{ duration: 0.15 }}
      className={cn(
        "relative border",
        isVertical
          ? "w-full rounded-xl p-3.5 sm:p-4"
          : "max-w-4xl mx-auto rounded-2xl p-4 sm:p-5",
        "transition-[border-color,box-shadow] duration-200",
        isVertical
          ? "shadow-[var(--shadow-card)]"
          : "shadow-[0_8px_32px_-4px_rgba(0,0,0,0.35),0_4px_16px_-2px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.02)]",
        "focus-within:!border-[var(--color-accent)]",
        isVertical
          ? "focus-within:ring-2 focus-within:ring-[var(--gold-tint-2)]"
          : "focus-within:shadow-[0_0_0_2px_rgba(212,168,79,0.55),0_12px_40px_-4px_rgba(212,168,79,0.14),0_4px_16px_-2px_rgba(0,0,0,0.3)]"
      )}
    >
      {isVertical && !hasAssets && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label={t.creation.browseImages}
          className={cn(
            "creation-empty mb-3 w-full rounded-lg border border-dashed",
            "flex flex-col items-center justify-center gap-2 text-center",
            "px-4 py-4 sm:py-7",
            "cursor-pointer transition-[background-color,border-color] duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]",
            isDragOver
              ? "border-[var(--gold)] bg-[var(--gold-tint)]"
              : "border-[var(--line)] bg-[var(--bg-2)]/45 hover:border-[var(--gold)] hover:bg-[var(--gold-tint)]/40",
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--gold-tint)] text-[var(--gold-lo)] ring-1 ring-[var(--gold-tint-2)]">
            <ImageIcon size={18} aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-[var(--fg-0)]">
            {t.creation.dropPhotosHere}
          </span>
          <span className="hidden max-w-[18rem] text-xs leading-relaxed text-[var(--fg-2)] sm:block">
            {t.creation.dropPhotosHint}
          </span>
        </button>
      )}

      {/* Thumbnail strip */}
      <AnimatePresence>
        {(pendingFiles.length > 0 || existingAssets.length > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 12 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" as const }}
            className="overflow-hidden"
            role="status"
            aria-live="polite"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--color-foreground)]">
                {sourceStatusText}
              </span>
              <span className="text-[11px] text-[var(--color-muted)] tabular-nums">
                {uploadedAssetIds.length}
                {mode === "video" ? ` / ${videoMinImages}` : ""}
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {existingAssets.map((asset, i) => {
                const imageNumber = i + 1;
                return (
                <motion.div
                  key={`existing-${asset.id}`}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15, ease: "easeOut" as const }}
                  className="relative shrink-0 group"
                >
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-lg ring-1 ring-[var(--color-accent)]/30",
                      isVertical ? "h-16 w-20" : "h-12 w-16",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.thumbnailUrl}
                      alt={`${t.creation.sourcePhoto} ${imageNumber}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] text-center mt-1 leading-none tabular-nums font-mono">
                    @image{imageNumber}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExistingAssets((prev) => prev.filter((a) => a.id !== asset.id))}
                    className={cn(
                      "absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full",
                      "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                      "flex items-center justify-center",
                      "text-[var(--color-muted)] hover:text-[var(--color-foreground)]",
                      "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                      "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    )}
                    aria-label={`${t.common.delete} ${t.creation.sourcePhoto} ${imageNumber}`}
                  >
                    <X size={10} />
                  </button>
                </motion.div>
                );
              })}

              {pendingFiles.map((pf, index) => {
                const imageNumber = existingAssets.length + index + 1;
                return (
                <motion.div
                  key={pf.preview}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15, ease: "easeOut" as const }}
                  className="relative shrink-0 group"
                >
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-lg",
                      isVertical ? "h-16 w-20" : "h-12 w-16",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pf.preview}
                      alt={`${t.creation.uploadingSourcePhoto} ${imageNumber}`}
                      className="w-full h-full object-cover"
                    />
                    {pf.isUploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 size={14} className="text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] text-center mt-1 leading-none tabular-nums font-mono">
                    @image{imageNumber}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className={cn(
                      "absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full",
                      "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                      "flex items-center justify-center",
                      "text-[var(--color-muted)] hover:text-[var(--color-foreground)]",
                      "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                      "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    )}
                    aria-label={`${t.common.delete} ${t.creation.sourcePhoto} ${imageNumber}`}
                  >
                    <X size={10} />
                  </button>
                </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Min-image gate feedback — visible the moment mode=video, any time the
          user is short of MIN_IMAGES_FOR_VIDEO. Framed as progress ("4 / 6")
          so uploads feel like a fill meter instead of a scolding. */}
      <AnimatePresence>
        {mode === "video" && videoImageShortfall > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 10 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" as const }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2",
                "text-xs",
                "bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/25",
                "text-[var(--color-foreground)]"
              )}
              role="status"
              aria-live="polite"
            >
              <ImageIcon
                size={13}
                className="text-[var(--color-accent)] shrink-0"
              />
              <span>
                <span className="font-medium tabular-nums">
                  {uploadedAssetIds.length} / {videoMinImages}
                </span>
                <span className="text-[var(--color-muted)]">
                  {" "}
                  {`— ${t.creation.addMoreImages} ${videoImageShortfall} ${t.creation.submitShortfallSuffix}.`}
                </span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Text input — only shown in enhance mode where the prompt actually
          steers the image tools. Video mode derives prompts from
          images+template+opener-bank; null/empty mode has nothing to type yet
          and the placeholder duplicates the drop-zone copy, so we hide it. */}
      {mode === "enhance" && (
        <div
          className={cn(
            "relative",
            isVertical &&
              "rounded-lg border border-transparent bg-transparent transition-[border-color,background-color] duration-150 focus-within:border-[var(--line-soft)] focus-within:bg-[var(--bg-2)]/35",
          )}
        >
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handlePromptChange}
            onKeyDown={handlePromptKeyDown}
            onBlur={() => {
              setTimeout(closeMention, 120);
            }}
            placeholder={
              mode === "enhance"
                ? t.creation.enhancePrompt
                : t.creation.dropImages
            }
            rows={1}
            className={cn(
              "w-full bg-transparent resize-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
              "text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]",
              "leading-relaxed",
              isVertical && "px-1.5 py-1.5 focus-visible:ring-0",
            )}
          />

          {/* @-mention autocomplete */}
          <AnimatePresence>
            {mention.open && mentionSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.1, ease: "easeOut" as const }}
                className={cn(
                  "absolute start-0 bottom-full mb-2 z-50",
                  "min-w-[180px] max-h-52 overflow-y-auto rounded-xl p-1",
                  "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                  "shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
                )}
                role="listbox"
                aria-label={t.creation.imageMentions}
              >
                {mentionSuggestions.map((name, i) => {
                  const active = i === mention.activeIndex;
                  return (
                    <button
                      key={name}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseDown={(e) => {
                        e.preventDefault();
                      }}
                      onClick={() => applyMention(name)}
                      onMouseEnter={() =>
                        setMention((s) => ({ ...s, activeIndex: i }))
                      }
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-start",
                        "text-xs font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                        active
                          ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                          : "text-[var(--color-foreground)] hover:bg-[var(--color-accent)]/8"
                      )}
                    >
                      <span className="text-[var(--color-muted)]">@</span>
                      <span>{name}</span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Expanded inputs for voiceover (only when toggled on) */}
      <AnimatePresence>
        {mode === "video" && (voiceoverEnabled || musicEnabled) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" as const }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              {voiceoverEnabled && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={voiceoverSubject}
                    onChange={(e) => setVoiceoverSubject(e.target.value)}
                    placeholder={t.creation.voiceoverSubject}
                    maxLength={240}
	                    className={cn(
	                      "w-full bg-[var(--color-surface-raised)] rounded-lg px-3 py-1.5",
	                      "text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]",
	                      "border border-[var(--color-border)]",
	                      "focus-visible:outline-none focus-visible:border-[var(--color-accent)]/50 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
	                    )}
                  />
                  <div className="relative">
                    <textarea
                      value={voiceoverText}
                      onChange={(e) => setVoiceoverText(e.target.value)}
	                      placeholder={t.creation.voiceoverText}
                      rows={2}
                      maxLength={500}
	                      className={cn(
	                        "w-full bg-[var(--color-surface-raised)] rounded-lg px-3 py-2 pr-9",
	                        "text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]",
	                        "border border-[var(--color-border)] resize-none",
	                        "focus-visible:outline-none focus-visible:border-[var(--color-accent)]/50 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
	                      )}
                    />
                  <button
                    type="button"
                    title={
                      voiceoverSubject.trim()
                        ? t.creation.createScriptAi
                        : t.creation.generateScriptNeedsSubject
                    }
	                    disabled={generatingScript || !voiceoverSubject.trim()}
	                    aria-label={t.creation.createScriptAi}
                    onClick={async () => {
                      setGeneratingScript(true);
                      try {
                        // luxury_30s target is 30s; pass that through to the
                        // narration generator so it sizes the script correctly.
                        const totalSec = 30;
                        const res = await fetch("/api/generate-script", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            prompt: voiceoverSubject.trim(),
                            duration: totalSec,
                          }),
                        });
                        if (!res.ok) {
                          const body = (await res.json().catch(() => ({}))) as {
                            error?: string;
                            code?: string;
                          };
                          if (
                            res.status === 503 &&
                            body.code === "auth_fetch_failed"
                          ) {
                            toast.error(t.creation.sessionAuthError);
                          } else {
                            toast.error(
                              body.error ?? t.creation.scriptError,
                            );
                          }
                          return;
                        }
                        const { script } = (await res.json()) as {
                          script?: string;
                        };
                        if (typeof script === "string" && script.trim().length > 0) {
                          setVoiceoverText(script);
                          toast.success(t.creation.scriptGenerated);
                        } else {
                          toast.error(t.creation.scriptEmpty);
                        }
                      } catch {
                        toast.error(t.creation.scriptError);
                      } finally {
                        setGeneratingScript(false);
                      }
                    }}
	                    className={cn(
	                      "absolute top-2 end-2 w-6 h-6 rounded-md flex items-center justify-center",
	                      "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                      generatingScript || !voiceoverSubject.trim()
                        ? "text-[var(--color-muted)]/40 cursor-not-allowed"
                        : "text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                    )}
                  >
                    {generatingScript ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Wand2 size={12} />
                    )}
                  </button>
                  </div>
                </div>
              )}
              {musicEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={musicPrompt}
                    onChange={(e) => setMusicPrompt(e.target.value)}
                    placeholder={t.creation.musicPrompt}
                    className={cn(
                      "flex-1 bg-[var(--color-surface-raised)] rounded-lg px-3 py-1.5",
                      "text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]",
                      "border border-[var(--color-border)]",
                      "focus-visible:outline-none focus-visible:border-[var(--color-accent)]/50 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30",
                    )}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
	                    value={musicVolume}
	                    onChange={(e) => setMusicVolume(Number(e.target.value))}
	                    className="w-14 accent-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    title={`${t.creation.musicVolume}: ${musicVolume}%`}
	                    aria-label={t.creation.musicVolume}
	                  />
                  <span className="text-xs text-[var(--color-muted)] w-7 text-start tabular-nums">
                    {musicVolume}%
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action row. Horizontal: single line with `flex-1` spacer pushing
          Submit to the end. Vertical (rail): stacks a 2-card mode chooser,
          a video-extras row (only when video mode), then a full-width Submit
          row at the bottom. */}
      <div
        className={cn(
          "mt-3",
          isVertical
            ? "flex flex-col gap-2.5"
            : "flex items-center gap-1 flex-wrap",
        )}
      >
        {/* Mode chooser. Vertical: 2-card grid with bold action labels +
            hint copy so the difference between "enhance one photo" and
            "make a video from many photos" is immediately legible. The
            wrapper uses `display:contents` in horizontal so the two pills
            flow inline with the rest of the action row. */}
        <div
          className={cn(
            isVertical ? "grid grid-cols-2 gap-2" : "contents",
          )}
          role="radiogroup"
          aria-label={t.creation.chooseMode}
        >
          {/* Video toggle (left card on RTL, becomes the visual "first" choice) */}
          <button
            type="button"
            onClick={() => toggleMode("video")}
            role={isVertical ? "radio" : undefined}
            aria-checked={isVertical ? mode === "video" : undefined}
            title={t.creation.createVideo}
            aria-label={t.creation.createVideo}
            className={cn(
              "transition-[background-color,color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
              isVertical
                ? cn(
                    "group flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-start",
                    mode === "video"
                      ? "border-[var(--gold)] bg-[var(--gold-tint)] shadow-[0_0_0_1px_var(--gold-tint-2)]"
                      : "border-[var(--line-soft)] bg-[var(--bg-1)] hover:border-[var(--gold)]/50 hover:bg-[var(--gold-tint)]/40",
                  )
                : cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium",
                    mode === "video"
                      ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30"
                      : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]",
                  ),
            )}
          >
            {isVertical ? (
              <>
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 transition-colors duration-150",
                    mode === "video"
                      ? "bg-[var(--gold)] text-[var(--on-gold)] ring-[var(--gold)]"
                      : "bg-[var(--gold-tint)] text-[var(--gold-lo)] ring-[var(--gold-tint-2)] group-hover:bg-[var(--gold)]/15",
                  )}
                >
                  <Video size={16} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-[13px] font-semibold leading-tight",
                      mode === "video" ? "text-[var(--gold-lo)]" : "text-[var(--fg-0)]",
                    )}
                  >
                    {t.creation.createVideo}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] leading-snug",
                      mode === "video" ? "text-[var(--gold-lo)]/80" : "text-[var(--fg-3)]",
                    )}
                  >
                    {t.creation.createVideoHint}
                  </span>
                </span>
                <ChevronRight
                  size={15}
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 rtl:rotate-180 transition-colors duration-150",
                    mode === "video" ? "text-[var(--gold-lo)]" : "text-[var(--fg-3)]",
                  )}
                />
              </>
            ) : (
              <>
                <Video size={14} aria-hidden="true" />
                <span>{t.creation.createVideo}</span>
              </>
            )}
          </button>

          {/* Photo Enhance toggle */}
          <button
            type="button"
            onClick={() => toggleMode("enhance")}
            role={isVertical ? "radio" : undefined}
            aria-checked={isVertical ? mode === "enhance" : undefined}
            title={t.creation.enhancePhoto}
            aria-label={t.creation.enhancePhoto}
            className={cn(
              "transition-[background-color,color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
              isVertical
                ? cn(
                    "group flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-start",
                    mode === "enhance"
                      ? "border-[var(--gold)] bg-[var(--gold-tint)] shadow-[0_0_0_1px_var(--gold-tint-2)]"
                      : "border-[var(--line-soft)] bg-[var(--bg-1)] hover:border-[var(--gold)]/50 hover:bg-[var(--gold-tint)]/40",
                  )
                : cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium",
                    mode === "enhance"
                      ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30"
                      : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]",
                  ),
            )}
          >
            {isVertical ? (
              <>
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 transition-colors duration-150",
                    mode === "enhance"
                      ? "bg-[var(--gold)] text-[var(--on-gold)] ring-[var(--gold)]"
                      : "bg-[var(--gold-tint)] text-[var(--gold-lo)] ring-[var(--gold-tint-2)] group-hover:bg-[var(--gold)]/15",
                  )}
                >
                  <Wand2 size={16} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-[13px] font-semibold leading-tight",
                      mode === "enhance" ? "text-[var(--gold-lo)]" : "text-[var(--fg-0)]",
                    )}
                  >
                    {t.creation.enhancePhoto}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] leading-snug",
                      mode === "enhance" ? "text-[var(--gold-lo)]/80" : "text-[var(--fg-3)]",
                    )}
                  >
                    {t.creation.enhancePhotoHint}
                  </span>
                </span>
                <ChevronRight
                  size={15}
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 rtl:rotate-180 transition-colors duration-150",
                    mode === "enhance" ? "text-[var(--gold-lo)]" : "text-[var(--fg-3)]",
                  )}
                />
              </>
            ) : (
              <>
                <Wand2 size={14} aria-hidden="true" />
                <span>{t.creation.enhancePhoto}</span>
              </>
            )}
          </button>
        </div>

        {/* Video extras (voiceover / music). Vertical wraps them in their
            own flex row below the mode chooser; horizontal flows inline via
            the existing `display:contents` from the parent. Aspect ratio
            and Seedance toggles were removed — the server picks the model
            via ENGINE_DEFAULT_MODEL. */}
        <div
          className={cn(
            isVertical
              ? "flex items-center gap-1 flex-wrap"
              : "contents",
          )}
        >
        {/* Video options — voiceover + music only now. Model / duration /
            template pickers are gone; server picks defaults. */}
        <AnimatePresence>
          {mode === "video" && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" as const }}
              className="inline-flex items-center gap-0.5 overflow-hidden"
            >
              <div className="w-px h-5 bg-[var(--color-border)] mx-1.5" />

              <button
                type="button"
                onClick={() => setVoiceoverEnabled(!voiceoverEnabled)}
                title={voiceoverEnabled ? t.creation.voiceoverOn : t.creation.voiceoverOff}
                aria-label={voiceoverEnabled ? t.creation.voiceoverOn : t.creation.voiceoverOff}
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center transition-colors duration-150",
                  voiceoverEnabled
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]"
                )}
              >
                <Mic size={13} />
              </button>

              <button
                type="button"
                onClick={() => setMusicEnabled(!musicEnabled)}
                title={musicEnabled ? t.creation.musicOn : t.creation.musicOff}
                aria-label={musicEnabled ? t.creation.musicOn : t.creation.musicOff}
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center transition-colors duration-150",
                  musicEnabled
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]"
                )}
              >
                <Music size={13} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!isVertical && <div className="flex-1" />}
        </div>

        {/* Browse + Submit. Horizontal: trailing inline buttons (the wrapper
            uses `display: contents` so they flow on the same line as the
            mode toggles). Vertical: bottom row with Submit stretched. */}
        <div
          className={cn(
            isVertical ? "flex items-center gap-2 pt-1" : "contents",
          )}
        >
        {/* Browse */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title={t.creation.browse}
          aria-label={t.creation.browseImages}
          className={cn(
            "rounded-lg flex items-center justify-center shrink-0",
            "text-[var(--color-muted)] transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            isVertical
              ? "w-10 h-10 border border-[var(--line-soft)] bg-[var(--bg-1)] hover:border-[var(--gold)] hover:text-[var(--gold-lo)]"
              : "w-8 h-8 hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]",
          )}
        >
          <Paperclip size={isVertical ? 16 : 15} />
        </button>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-label={
            mode === "enhance"
              ? t.creation.enhancePhoto
              : mode === "video"
                ? t.creation.createVideo
                : t.creation.create
          }
          title={
            !hasAssets
              ? t.creation.addImagesFirst
              : !mode
                ? t.creation.chooseMode
                : mode === "video" && videoImageShortfall > 0
                  ? `${t.creation.addMoreImages} ${videoImageShortfall} ${t.creation.submitShortfallSuffix}`
                  : mode === "enhance"
                    ? t.creation.enhancePhoto
                    : t.creation.createVideo
          }
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-lg",
            "font-medium transition-[background-color,color,filter,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            isVertical ? "flex-1 h-10 px-4 text-sm" : "px-3 py-1.5 text-xs",
            canSubmit
              ? "bg-[var(--gold)] text-[var(--on-gold)] shadow-[var(--shadow-gold)] hover:brightness-105"
              : isVertical
                ? "bg-[var(--bg-2)] text-[var(--fg-3)] cursor-not-allowed"
                : "bg-[var(--color-surface-raised)] text-[var(--color-muted)]/50 cursor-not-allowed",
          )}
        >
          <Send size={isVertical ? 14 : 13} />
          <span className={isVertical ? "" : "hidden sm:inline"}>
            {mode === "enhance"
              ? t.creation.enhance
              : mode === "video"
                ? t.creation.create
                : t.creation.create}
          </span>
        </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        name="sourceImages"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleFileChange}
      />
    </motion.div>
    <AspectRatioWarningModal
      isOpen={arWarning?.open ?? false}
      mismatches={arWarning?.mismatches ?? []}
      targetAspectRatio={arWarning?.targetAspectRatio ?? "16:9"}
      onCancel={() => setArWarning(null)}
      onConfirm={() => {
        setArWarning(null);
        submitVideoGeneration();
      }}
    />
    </>
  );
}
