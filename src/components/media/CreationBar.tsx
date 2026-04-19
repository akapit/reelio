"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Sparkles,
  Video,
  Paperclip,
  X,
  Loader2,
  Send,
  Mic,
  Music,
  Image as ImageIcon,
  Check,
  ChevronDown,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpload } from "@/hooks/use-upload";
import { useProcess } from "@/hooks/use-process";
import { useEngineGenerate } from "@/hooks/use-engine-generate";
import { toast } from "sonner";
import type { VideoModel } from "@/lib/media/types";

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

interface CreationBarProps {
  projectId: string;
  preload?: RerunPayload | null;
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

const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|gif|heic|mp4|mov|webm|avi)$/i;

type AspectRatioOption = "16:9" | "9:16" | "1:1";
const ASPECT_RATIOS: { id: AspectRatioOption; label: string; icon: string }[] = [
  { id: "16:9", label: "Landscape", icon: "▬" },
  { id: "9:16", label: "Portrait", icon: "▮" },
  { id: "1:1", label: "Square", icon: "◼" },
];

export function CreationBar({ projectId, preload }: CreationBarProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [existingAssets, setExistingAssets] = useState<ExistingAsset[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [mode, setMode] = useState<CreationMode>(null);

  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  const [voiceoverEnabled, setVoiceoverEnabled] = useState(false);
  const [voiceoverText, setVoiceoverText] = useState("");
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState(
    "Soft ambient piano, luxury real estate"
  );
  // 0..100 in UI; divided by 100 when sent server-side.
  const [musicVolume, setMusicVolume] = useState(20);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>("16:9");
  const [aspectRatioOpen, setAspectRatioOpen] = useState(false);

  // @-mention autocomplete state. `startIndex` is the position of the '@' in `prompt`.
  const [mention, setMention] = useState<{
    open: boolean;
    query: string;
    startIndex: number;
    activeIndex: number;
  }>({ open: false, query: "", startIndex: -1, activeIndex: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const aspectRatioRef = useRef<HTMLDivElement>(null);
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

  // Video requires ≥ MIN_IMAGES_FOR_VIDEO; enhance requires ≥ 1. Show the
  // actual gate ("need N more") as inline copy under the thumbnail strip,
  // and disable submit until we clear it.
  const videoImageShortfall = Math.max(
    0,
    MIN_IMAGES_FOR_VIDEO - uploadedAssetIds.length,
  );
  const videoGateMet = mode !== "video" || videoImageShortfall === 0;
  const canSubmit = hasAssets && !isUploading && mode !== null && videoGateMet;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [prompt]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      pendingFiles.forEach((f) => URL.revokeObjectURL(f.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close aspect-ratio dropdown on outside click
  useEffect(() => {
    if (!aspectRatioOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        aspectRatioRef.current &&
        !aspectRatioRef.current.contains(e.target as Node)
      ) {
        setAspectRatioOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [aspectRatioOpen]);

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
    setPrompt(preload.prompt);
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

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const accepted = Array.from(files).filter((f) =>
        ACCEPTED_EXTENSIONS.test(f.name)
      );
      if (accepted.length === 0) return;

      // Default to "video" mode the moment the first asset lands and no
      // mode has been chosen — without this, drag-drop users never see
      // the Auto-prompt button (it gates on `mode === "video"`).
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
    [upload]
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
    [addFiles]
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

  // Submit
  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;

    if (mode === "enhance") {
      uploadedAssetIds.forEach((assetId) => {
        process.mutate({ assetId, projectId, tool: "enhance" });
      });
      toast.success(
        `Enhancing ${uploadedAssetIds.length} photo${uploadedAssetIds.length > 1 ? "s" : ""}`
      );
    } else if (mode === "video") {
      if (uploadedAssetIds.length > 0) {
        // Dispatch to the scene-based engine. The server picks the model
        // (ENGINE_DEFAULT_MODEL env, default "kling") and drives the luxury
        // template. No model / duration / template knobs here anymore.
        engine.mutate({
          projectId,
          imageAssetIds: uploadedAssetIds,
          templateName: ENGINE_TEMPLATE,
          voiceoverText: voiceoverEnabled
            ? voiceoverText.trim() || undefined
            : undefined,
          musicPrompt: musicEnabled
            ? musicPrompt.trim() || undefined
            : undefined,
          musicVolume: musicEnabled ? musicVolume / 100 : undefined,
        });
      }
    }

    clearAll();
  }, [
    canSubmit,
    mode,
    uploadedAssetIds,
    process,
    engine,
    projectId,
    voiceoverEnabled,
    voiceoverText,
    musicEnabled,
    musicPrompt,
    musicVolume,
    clearAll,
  ]);

  // Auto-prompt is a cosmetic textarea helper — its output feeds the
  // voiceover-script generator and the mention UX, not the engine. We hardcode
  // the model/duration knobs the API expects to the luxury-template defaults
  // so the helper keeps working after the UI sliders were removed.
  const handleAutoPrompt = useCallback(async () => {
    if (generatingPrompt || isUploading || uploadedAssetIds.length === 0) return;
    setGeneratingPrompt(true);
    try {
      const res = await fetch("/api/generate-video-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoModel: "seedance",
          imageAssetIds: uploadedAssetIds,
          duration: 30,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        if (res.status === 503 && body.code === "auth_fetch_failed") {
          toast.error("Couldn't verify session — please try again.");
        } else {
          toast.error(body.error ?? "Failed to generate prompt");
        }
        return;
      }
      const { prompt: generated } = (await res.json()) as { prompt?: string };
      if (typeof generated === "string" && generated.trim().length > 0) {
        setPrompt(generated);
        toast.success("Prompt generated — review and edit before generating");
      } else {
        toast.error("Empty prompt returned — please try again");
      }
    } catch {
      toast.error("Couldn't reach the prompt service. Please try again.");
    } finally {
      setGeneratingPrompt(false);
    }
  }, [generatingPrompt, isUploading, uploadedAssetIds]);

  const toggleMode = (m: CreationMode) => {
    setMode((prev) => (prev === m ? null : m));
  };

  return (
    <motion.div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      animate={{
        borderColor: isDragOver
          ? "var(--color-accent)"
          : "rgba(201,168,76,0.5)",
        backgroundColor: isDragOver
          ? "rgba(201,168,76,0.04)"
          : "var(--color-surface)",
      }}
      transition={{ duration: 0.15 }}
      className={cn(
        "relative max-w-4xl mx-auto rounded-2xl border p-4 sm:p-5",
        "transition-[border-color,box-shadow] duration-200",
        "shadow-[0_8px_32px_-4px_rgba(0,0,0,0.35),0_4px_16px_-2px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.02)]",
        "focus-within:!border-[var(--color-accent)]",
        "focus-within:shadow-[0_0_0_2px_rgba(201,168,76,0.55),0_12px_40px_-4px_rgba(201,168,76,0.14),0_4px_16px_-2px_rgba(0,0,0,0.3)]"
      )}
    >
      {/* Thumbnail strip */}
      <AnimatePresence>
        {(pendingFiles.length > 0 || existingAssets.length > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 12 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" as const }}
            className="overflow-hidden"
          >
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
                  <div className="relative w-16 h-12 rounded-lg overflow-hidden ring-1 ring-[var(--color-accent)]/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] text-center mt-1 leading-none tabular-nums font-mono">
                    @image{imageNumber}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExistingAssets((prev) => prev.filter((a) => a.id !== asset.id))}
                    className={cn(
                      "absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full",
                      "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                      "flex items-center justify-center",
                      "text-[var(--color-muted)] hover:text-[var(--color-foreground)]",
                      "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                      "focus:opacity-100 outline-none"
                    )}
                    aria-label={`Remove image ${imageNumber}`}
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
                  <div className="relative w-16 h-12 rounded-lg overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pf.preview} alt="" className="w-full h-full object-cover" />
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
                      "absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full",
                      "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                      "flex items-center justify-center",
                      "text-[var(--color-muted)] hover:text-[var(--color-foreground)]",
                      "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                      "focus:opacity-100 outline-none"
                    )}
                    aria-label={`Remove image ${imageNumber}`}
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
                  {uploadedAssetIds.length} / {MIN_IMAGES_FOR_VIDEO}
                </span>
                <span className="text-[var(--color-muted)]">
                  {" "}
                  — add {videoImageShortfall} more{" "}
                  {videoImageShortfall === 1 ? "photo" : "photos"} to generate a
                  video.
                </span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Text input */}
      <div className="relative">
        {mode === "video" && uploadedAssetIds.length >= 1 && !isUploading && (
          <button
            type="button"
            aria-label="Auto-generate prompt from your images"
            title="Auto-generate prompt from your images"
            disabled={generatingPrompt}
            onClick={handleAutoPrompt}
            className={cn(
              "absolute top-0 right-0 z-10",
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md",
              "text-xs font-medium transition-colors duration-150 outline-none",
              "border",
              generatingPrompt
                ? "text-[var(--color-accent)]/60 border-[var(--color-accent)]/20 cursor-not-allowed"
                : "text-[var(--color-accent)] border-[var(--color-accent)]/35 bg-[var(--color-accent)]/5 hover:bg-[var(--color-accent)]/15"
            )}
          >
            {generatingPrompt ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            <span>{generatingPrompt ? "Generating…" : "Auto-prompt"}</span>
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={handlePromptChange}
          onKeyDown={handlePromptKeyDown}
          onBlur={() => {
            setTimeout(closeMention, 120);
          }}
          placeholder={
            mode === "video"
              ? "Describe the video (optional) — type @ to reference images..."
              : mode === "enhance"
                ? "Describe the enhancement (or leave empty for auto)..."
                : "Drop photos and select what to create..."
          }
          rows={1}
          className={cn(
            "w-full bg-transparent resize-none outline-none",
            "text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]",
            "leading-relaxed",
            mode === "video" && uploadedAssetIds.length >= 1 && !isUploading
              ? "pr-32"
              : ""
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
                "absolute left-0 bottom-full mb-2 z-50",
                "min-w-[180px] max-h-52 overflow-y-auto rounded-xl p-1",
                "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                "shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
              )}
              role="listbox"
              aria-label="Image mentions"
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
                      "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left",
                      "text-xs font-medium transition-colors duration-100",
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
                <div className="relative">
                  <textarea
                    value={voiceoverText}
                    onChange={(e) => setVoiceoverText(e.target.value)}
                    placeholder="Write the narration script..."
                    rows={2}
                    maxLength={500}
                    className={cn(
                      "w-full bg-[var(--color-surface-raised)] rounded-lg px-3 py-2 pr-9",
                      "text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]",
                      "border border-[var(--color-border)] outline-none resize-none",
                      "focus:border-[var(--color-accent)]/50"
                    )}
                  />
                  <button
                    type="button"
                    title="Generate script with AI"
                    disabled={generatingScript || !prompt.trim()}
                    onClick={async () => {
                      setGeneratingScript(true);
                      try {
                        // luxury_30s target is 30s; pass that through to the
                        // narration generator so it sizes the script correctly.
                        const totalSec = 30;
                        const res = await fetch("/api/generate-script", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ prompt: prompt.trim(), duration: totalSec }),
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
                            toast.error(
                              "Couldn't verify session — please try again.",
                            );
                          } else {
                            toast.error(
                              body.error ?? "Failed to generate script",
                            );
                          }
                          return;
                        }
                        const { script } = (await res.json()) as {
                          script?: string;
                        };
                        if (typeof script === "string" && script.trim().length > 0) {
                          setVoiceoverText(script);
                          toast.success("Script generated");
                        } else {
                          toast.error(
                            "Empty script returned — please try again",
                          );
                        }
                      } catch {
                        toast.error("Failed to generate script");
                      } finally {
                        setGeneratingScript(false);
                      }
                    }}
                    className={cn(
                      "absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center",
                      "transition-colors duration-150",
                      generatingScript || !prompt.trim()
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
              )}
              {musicEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={musicPrompt}
                    onChange={(e) => setMusicPrompt(e.target.value)}
                    placeholder="Music style..."
                    className={cn(
                      "flex-1 bg-[var(--color-surface-raised)] rounded-lg px-3 py-1.5",
                      "text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]",
                      "border border-[var(--color-border)] outline-none",
                      "focus:border-[var(--color-accent)]/50"
                    )}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(Number(e.target.value))}
                    className="w-14 accent-[var(--color-accent)]"
                    title={`Volume: ${musicVolume}%`}
                  />
                  <span className="text-xs text-[var(--color-muted)] w-7 text-right tabular-nums">
                    {musicVolume}%
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action row — all on one line */}
      <div className="flex items-center gap-1 mt-3 flex-wrap">
        {/* Photo Enhance toggle */}
        <button
          type="button"
          onClick={() => toggleMode("enhance")}
          title="Enhance photos"
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
            "text-xs font-medium transition-colors duration-150 outline-none",
            mode === "enhance"
              ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30"
              : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]"
          )}
        >
          <ImageIcon size={14} />
          <span className="hidden sm:inline">Photo</span>
        </button>

        {/* Video toggle */}
        <button
          type="button"
          onClick={() => toggleMode("video")}
          title="Generate video"
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
            "text-xs font-medium transition-colors duration-150 outline-none",
            mode === "video"
              ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30"
              : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]"
          )}
        >
          <Video size={14} />
          <span className="hidden sm:inline">Video</span>
        </button>

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
                title={voiceoverEnabled ? "Voiceover enabled" : "Add voiceover"}
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
                title={musicEnabled ? "Music enabled" : "Add background music"}
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

        {/* Aspect ratio picker */}
        {mode === "video" && (
          <div ref={aspectRatioRef} className="relative flex items-center">
            <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
            <button
              type="button"
              onClick={() => setAspectRatioOpen((prev) => !prev)}
              title="Aspect ratio"
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-md",
                "text-xs font-medium transition-colors duration-150 outline-none",
                aspectRatioOpen
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-foreground)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]"
              )}
            >
              <span className="truncate">{aspectRatio}</span>
              <ChevronDown
                size={11}
                className={cn(
                  "transition-transform duration-150",
                  aspectRatioOpen && "rotate-180"
                )}
              />
            </button>

            <AnimatePresence>
              {aspectRatioOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12, ease: "easeOut" as const }}
                  className={cn(
                    "absolute bottom-full left-0 mb-2 z-50",
                    "w-40 rounded-xl overflow-hidden",
                    "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                    "shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
                  )}
                >
                  <div className="p-1.5">
                    {ASPECT_RATIOS.map((ar) => {
                      const isSelected = aspectRatio === ar.id;
                      return (
                        <button
                          key={ar.id}
                          type="button"
                          onClick={() => {
                            setAspectRatio(ar.id);
                            setAspectRatioOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left",
                            "transition-colors duration-150",
                            isSelected
                              ? "bg-[var(--color-accent)]/12"
                              : "hover:bg-[var(--color-accent)]/8"
                          )}
                        >
                          <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                            {isSelected ? (
                              <Check
                                size={13}
                                className="text-[var(--color-accent)]"
                              />
                            ) : (
                              <span className="text-xs text-[var(--color-muted)]">{ar.icon}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "text-xs font-medium truncate",
                                isSelected
                                  ? "text-[var(--color-accent)]"
                                  : "text-[var(--color-foreground)]"
                              )}
                            >
                              {ar.label}
                            </p>
                            <p className="text-[11px] text-[var(--color-muted)]">{ar.id}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="flex-1" />

        {/* Browse */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title="Browse files"
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            "text-[var(--color-muted)] transition-colors duration-150 outline-none",
            "hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]"
          )}
        >
          <Paperclip size={15} />
        </button>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          title={
            !hasAssets
              ? "Add photos first"
              : !mode
                ? "Select a mode"
                : mode === "video" && videoImageShortfall > 0
                  ? `Add ${videoImageShortfall} more photo${
                      videoImageShortfall === 1 ? "" : "s"
                    } to generate`
                  : mode === "enhance"
                    ? "Enhance photos"
                    : "Generate video"
          }
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
            "text-xs font-medium transition-all duration-150 outline-none",
            canSubmit
              ? "bg-[var(--color-accent)] text-[var(--color-background)] hover:brightness-110"
              : "bg-[var(--color-surface-raised)] text-[var(--color-muted)]/50 cursor-not-allowed"
          )}
        >
          <Send size={13} />
          <span className="hidden sm:inline">
            {mode === "enhance"
              ? "Enhance"
              : mode === "video"
                ? "Generate"
                : "Create"}
          </span>
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        onChange={handleFileChange}
      />
    </motion.div>
  );
}
