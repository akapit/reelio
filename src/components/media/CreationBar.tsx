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
  LayoutTemplate,
  Film,
  Zap,
  Clock,
  Wand2,
  Check,
  ChevronDown,
  Sun,
  MoveHorizontal,
  Plane,
  Compass,
  Frame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpload } from "@/hooks/use-upload";
import { useProcess } from "@/hooks/use-process";
import { useEngineGenerate } from "@/hooks/use-engine-generate";
import { useTemplates, type Template } from "@/hooks/use-templates";
import { toast } from "sonner";
import type { VideoModel } from "@/lib/media/types";
import type { TemplateName as EngineTemplateName } from "@/lib/engine/models";
import {
  VIDEO_EFFECTS,
  type VideoEffect,
} from "@/lib/media/effects/library";

export interface RerunAssetRef {
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  assetType: "image" | "video";
}

export interface RerunPayload {
  /** Monotonic nonce — change it to signal a fresh preload. */
  nonce: number;
  prompt: string;
  videoModel: VideoModel;
  /** Total video duration in seconds. For Kling this is N × per-shot; for
   * Seedance it's the single-clip duration. */
  duration: number;
  voiceoverText?: string;
  musicPrompt?: string;
  /** 0..1 (same scale as stored in metadata) */
  musicVolume?: number;
  /** The primary source image (FK'd via `source_asset_id`). */
  sourceAsset: RerunAssetRef;
  /** Additional reference images (from `metadata.referenceAssetIds`). Kept
   * separate from `sourceAsset` so the primary stays at index 0 when they're
   * re-installed as `existingAssets`. Optional for backwards-compat with
   * older callers / re-runs of single-image generations. */
  referenceAssets?: RerunAssetRef[];
  /** Effect id snapshotted at original generation time. Looked up in
   * VIDEO_EFFECTS on preload to restore the picker state. */
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

const TEMPLATE_ICONS: Record<string, typeof Sparkles> = {
  film: Film,
  zap: Zap,
  sparkles: Sparkles,
  video: Video,
  sun: Sun,
  "move-horizontal": MoveHorizontal,
  plane: Plane,
  wand: Wand2,
  compass: Compass,
  frame: Frame,
};

const VIDEO_MODELS: { id: VideoModel; label: string; description: string }[] = [
  { id: "kling", label: "Kling", description: "Multi-shot cinematic (auto-concatenated)" },
  { id: "seedance", label: "Seedance 2.0", description: "Stylized, versatile animation" },
  { id: "seedance-fast", label: "Seedance 2.0 Fast", description: "Quicker runs, lower cost" },
];

type AspectRatioOption = "16:9" | "9:16" | "1:1";
const ASPECT_RATIOS: { id: AspectRatioOption; label: string; icon: string }[] = [
  { id: "16:9", label: "Landscape", icon: "▬" },
  { id: "9:16", label: "Portrait", icon: "▮" },
  { id: "1:1", label: "Square", icon: "◼" },
];

/**
 * Scene-engine templates exposed in the UI. Labels are shown in the picker;
 * ids must match `TEMPLATE_NAMES` in @/lib/engine/models and correspond to
 * JSON files under src/lib/engine/templates/.
 */
const ENGINE_TEMPLATE_META: {
  id: EngineTemplateName;
  label: string;
  description: string;
}[] = [
  { id: "fast_15s", label: "Social Reel · 15s", description: "Short, punchy, 9:16 — Instagram/TikTok" },
  { id: "investor_20s", label: "Investor · 20s", description: "Crisp, data-forward pitch" },
  { id: "family_30s", label: "Family · 30s", description: "Warm, story-led walkthrough" },
  { id: "luxury_30s", label: "Luxury · 30s", description: "Cinematic listing tour" },
  { id: "premium_45s", label: "Premium · 45s", description: "Full hero-to-close reel" },
];

/** Kling 2.6 auto-fan caps at 8 shots; each shot is 5s or 10s. */
const KLING_MAX_SHOTS_UI = 8;

interface DurationConstraints {
  min: number;
  max: number;
  step: number;
}

/** Slider bounds for the given model. The slider now controls PER-SHOT
 *  duration for Kling (since each attached image becomes a shot and each
 *  shot is 5s or 10s). Seedance remains a single-clip range. Image count
 *  is no longer a factor — multiplying the min by N made the minimum
 *  jump to 20s+ when a re-run re-attached reference images, which users
 *  (rightly) found confusing.
 *  - Kling:    step 5s; range [5, 10] per shot (total = per-shot × N).
 *  - Seedance: step 1s; range [4, 15] (kie.ai single-clip integer range). */
function getDurationConstraints(model: VideoModel): DurationConstraints {
  if (model === "kling") {
    return { min: 5, max: 10, step: 5 };
  }
  return { min: 4, max: 15, step: 1 };
}

/** Snap `value` into [min, max] on the step grid. */
function clampDuration(value: number, c: DurationConstraints): number {
  const bounded = Math.max(c.min, Math.min(c.max, value));
  return Math.round((bounded - c.min) / c.step) * c.step + c.min;
}

/** Kling only: compute the fan-out total for N shots all at `perShot` duration.
 *  Capped at KLING_MAX_SHOTS_UI since the auto-fan won't exceed that. */
function klingTotalDuration(perShot: number, imageCount: number): number {
  const n = Math.min(Math.max(imageCount, 1), KLING_MAX_SHOTS_UI);
  return perShot * n;
}

export function CreationBar({ projectId, preload }: CreationBarProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [existingAssets, setExistingAssets] = useState<ExistingAsset[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [mode, setMode] = useState<CreationMode>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);

  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  // Video options — `videoDuration` is PER-SHOT for Kling (5 or 10) and the
  // single-clip duration for Seedance (4..15). The wire protocol to /api/process
  // and /api/generate-video-prompt expects TOTAL; we multiply by the image
  // count at submit time for Kling so the server-side fan-out math is unchanged.
  const [videoDuration, setVideoDuration] = useState<number>(5);
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(false);
  const [voiceoverText, setVoiceoverText] = useState("");
  // Music is generated by ElevenLabs separately from the video model and
  // muxed onto the full-length (post-concat for Kling) video at the end.
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState(
    "Soft ambient piano, luxury real estate"
  );
  // 0..100 in UI; divided by 100 when sent server-side.
  const [musicVolume, setMusicVolume] = useState(20);
  // Default to Seedance Fast — ~5× faster than Kling on kie.ai today (and
  // a single-clip generation, so no fan-out latency stacking). Users can
  // still pick Kling from the model dropdown for multi-shot cinematic output.
  const [videoModel, setVideoModel] = useState<VideoModel>("seedance-fast");
  const [videoModelOpen, setVideoModelOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>("16:9");
  const [aspectRatioOpen, setAspectRatioOpen] = useState(false);
  // Scene-engine template selection. Drives /api/engine/generate when mode
  // is "video". Default fast_15s matches the most-requested social-reel format.
  const [engineTemplate, setEngineTemplate] =
    useState<EngineTemplateName>("fast_15s");
  const [engineTemplateOpen, setEngineTemplateOpen] = useState(false);

  // @-mention autocomplete state. `startIndex` is the position of the '@' in `prompt`.
  const [mention, setMention] = useState<{
    open: boolean;
    query: string;
    startIndex: number;
    activeIndex: number;
  }>({ open: false, query: "", startIndex: -1, activeIndex: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);
  const videoModelRef = useRef<HTMLDivElement>(null);
  const aspectRatioRef = useRef<HTMLDivElement>(null);
  const upload = useUpload(projectId);
  const process = useProcess();
  const engine = useEngineGenerate();
  const { data: templates } = useTemplates();

  const uploadedAssetIds = [
    ...pendingFiles
      .map((f) => f.uploadedAssetId)
      .filter((id): id is string => id !== null),
    ...existingAssets.map((a) => a.id),
  ];

  const isUploading = pendingFiles.some((f) => f.isUploading);
  const hasAssets = uploadedAssetIds.length > 0;
  const canSubmit = hasAssets && !isUploading && mode !== null;

  // Achievable slider range for the active model. Per-shot for Kling,
  // single-clip for Seedance — image count is no longer a multiplier on
  // the slider itself.
  const durationConstraints = useMemo(
    () => getDurationConstraints(videoModel),
    [videoModel],
  );

  // Keep `videoDuration` inside the current range when the model switches
  // (e.g. picking 12s on Seedance then switching to Kling should snap to
  // 10s per shot).
  useEffect(() => {
    const clamped = clampDuration(videoDuration, durationConstraints);
    if (clamped !== videoDuration) setVideoDuration(clamped);
  }, [durationConstraints, videoDuration]);

  // Effects are Kling-only in v1. Silently clear any selected effect when the
  // user switches to a non-Kling model (same pattern as duration snapping —
  // no toast). Re-selecting Kling leaves the picker empty; the user can pick
  // an effect again.
  useEffect(() => {
    if (videoModel !== "kling" && selectedEffectId !== null) {
      setSelectedEffectId(null);
    }
  }, [videoModel, selectedEffectId]);

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

  // Close templates dropdown on outside click
  useEffect(() => {
    if (!templatesOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        templatesRef.current &&
        !templatesRef.current.contains(e.target as Node)
      ) {
        setTemplatesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [templatesOpen]);

  // Close video-model dropdown on outside click
  useEffect(() => {
    if (!videoModelOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        videoModelRef.current &&
        !videoModelRef.current.contains(e.target as Node)
      ) {
        setVideoModelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [videoModelOpen]);

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

  // Preload from a "Re-run" click on a past asset. Keyed on `nonce` so the
  // same payload can be reapplied by bumping the nonce from the parent.
  useEffect(() => {
    if (!preload) return;
    // Replace existing uploads with the source asset PLUS any reference
    // images from the original run. Primary stays at index 0 (Kling's first
    // shot / Seedance's `first_frame_url`); references follow. Clear any
    // pending blob-backed files — they'd be stale for this flow.
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
    setVideoModel(preload.videoModel);
    // Metadata stores TOTAL duration (what the server-side fan-out saw). The
    // slider now holds PER-SHOT for Kling — convert by dividing by N and
    // snapping to [5, 10]. Seedance stored total equals the slider value.
    if (preload.videoModel === "kling") {
      const n = Math.max(1, reattachedAssets.length);
      const perShot = Math.round(preload.duration / n / 5) * 5;
      setVideoDuration(Math.max(5, Math.min(10, perShot)));
    } else {
      setVideoDuration(preload.duration);
    }
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
      // stored as 0..1; UI is 0..100
      if (preload.musicVolume != null) {
        setMusicVolume(Math.round(preload.musicVolume * 100));
      }
    } else {
      setMusicEnabled(false);
    }
    setSelectedTemplateId(null);
    // Restore the effect picker from the snapshotted id. `getEffect` returns
    // null for stale / removed ids, in which case the picker just starts
    // empty — the stored `effectPhrases` in metadata still describe what the
    // original run used.
    setSelectedEffectId(preload.effectId ?? null);
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
      // We do NOT override an explicit user choice (e.g. they picked
      // "enhance" first, then dragged photos in).
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
    setVideoDuration(5);
    setSelectedTemplateId(null);
    setSelectedEffectId(null);
  }, []);

  const applyTemplate = useCallback((template: Template) => {
    if (selectedTemplateId === template.id) {
      // Deselect — reset to defaults
      setSelectedTemplateId(null);
      setMode(null);
      setPrompt("");
      setVideoDuration(5);
      setVoiceoverEnabled(false);
      setVoiceoverText("");
      setMusicEnabled(false);
      setMusicPrompt("Soft ambient piano, luxury real estate");
      setMusicVolume(20);
      setTemplatesOpen(false);
      toast.success("Template removed");
      return;
    }
    setSelectedTemplateId(template.id);
    setMode(template.tool);
    setPrompt(template.prompt);
    const s = template.settings;
    if (s.duration) setVideoDuration(s.duration);
    setVoiceoverEnabled(!!s.voiceoverEnabled);
    if (s.voiceoverText) setVoiceoverText(s.voiceoverText);
    setMusicEnabled(!!s.musicEnabled);
    if (s.musicPrompt) setMusicPrompt(s.musicPrompt);
    if (s.musicVolume !== undefined) setMusicVolume(s.musicVolume);
    setTemplatesOpen(false);
    toast.success(`Template "${template.name}" applied`);
  }, [selectedTemplateId]);

  // Effects are independent from templates — picking an effect only sets
  // `selectedEffectId`. The styles block still drives base prompt / duration /
  // voiceover config; the effect just wraps the per-shot prompts at fan-out.
  // Clicking the same effect card again toggles it off.
  const applyEffect = useCallback((effect: VideoEffect) => {
    if (selectedEffectId === effect.id) {
      setSelectedEffectId(null);
      return;
    }
    setSelectedEffectId(effect.id);
    toast.success(`Effect "${effect.name}" applied`);
  }, [selectedEffectId]);

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
          // Mirror the auto-mode behavior of addFiles for existing-asset
          // drops so the Auto-prompt button appears immediately.
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
      // Walk backward from the caret to find an '@' that opens a mention.
      // A mention is valid if '@' is at start-of-string or preceded by whitespace,
      // and the characters between '@' and the caret are alphanumeric only.
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
        // Dispatch to the scene-based engine. Per-shot model choice and
        // cinematography prompts are decided server-side by the planner +
        // Claude prompt writer; the UI only picks the template, aspect, and
        // optional voiceover/music.
        engine.mutate({
          projectId,
          imageAssetIds: uploadedAssetIds,
          templateName: engineTemplate,
          voiceoverText: voiceoverEnabled
            ? voiceoverText.trim() || undefined
            : undefined,
          musicPrompt: musicEnabled
            ? musicPrompt.trim() || undefined
            : undefined,
          musicVolume: musicEnabled ? musicVolume / 100 : undefined,
        });
        // useEngineGenerate.onSuccess surfaces its own toast — no duplicate.
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
    engineTemplate,
    voiceoverEnabled,
    voiceoverText,
    musicEnabled,
    musicPrompt,
    musicVolume,
    clearAll,
  ]);

  const handleAutoPrompt = useCallback(async () => {
    if (generatingPrompt || isUploading || uploadedAssetIds.length === 0) return;
    setGeneratingPrompt(true);
    try {
      // Send total duration — the prompt-generation route expects total and
      // derives per-shot context from it server-side. For Kling we multiply
      // per-shot × N here since the slider now holds per-shot.
      const totalDuration =
        videoModel === "kling"
          ? klingTotalDuration(videoDuration, uploadedAssetIds.length)
          : videoDuration;
      const res = await fetch("/api/generate-video-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoModel,
          imageAssetIds: uploadedAssetIds,
          duration: totalDuration,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        // Distinguish "auth fetch failed" (transient network) from
        // genuine 401 so the user gets actionable copy. The route now
        // emits `code: "auth_fetch_failed"` with status 503 when the
        // Supabase auth check itself fails.
        if (res.status === 503 && body.code === "auth_fetch_failed") {
          toast.error("Couldn't verify session — please try again.");
        } else {
          toast.error(body.error ?? "Failed to generate prompt");
        }
        return;
      }
      const { prompt: generated } = (await res.json()) as { prompt?: string };
      // Defensive: never silently overwrite the textarea with an empty
      // string from a malformed success response.
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
  }, [generatingPrompt, isUploading, uploadedAssetIds, videoModel, videoDuration]);

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

      {/* Text input */}
      <div className="relative">
        {/* Auto-generate prompt button — only visible in video mode with at
            least one image. Sized at text-xs (12px) and always shows the
            label so users notice it; the previous text-[10px] icon-on-mobile
            treatment was below accessibility thresholds and easy to miss. */}
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
            // Delay so a click on a suggestion can fire before we close.
            setTimeout(closeMention, 120);
          }}
          placeholder={
            mode === "video"
              ? videoModel === "kling"
                ? "Describe the video — each attached image becomes its own scene at the selected duration..."
                : "Describe the shot — type @ to reference images (e.g. '@image1 pans slowly')..."
              : mode === "enhance"
                ? "Describe the enhancement (or leave empty for auto)..."
                : "Drop photos and select what to create..."
          }
          rows={1}
          className={cn(
            "w-full bg-transparent resize-none outline-none",
            "text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]",
            "leading-relaxed",
            // Reserve room on the right so typed text never slides under
            // the absolutely-positioned Auto-prompt button.
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
                      // Prevent textarea blur before click fires.
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
                        // `videoDuration` is already the total — send it
                        // straight through to the narration generator.
                        const totalSec = videoDuration;
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

        {/* Video options — inline icons, only when video mode active */}
        <AnimatePresence>
          {mode === "video" && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" as const }}
              className="inline-flex items-center gap-0.5 overflow-hidden"
            >
              {/* Separator */}
              <div className="w-px h-5 bg-[var(--color-border)] mx-1.5" />

              {/* Duration slider — per-shot for Kling (5 or 10), single-clip
                  for Seedance. For multi-image Kling runs the label shows
                  "5s × N = 20s" so the user sees the total they'll get. */}
              {(() => {
                const imageCount = Math.max(1, uploadedAssetIds.length);
                const isKlingMulti =
                  videoModel === "kling" && imageCount > 1;
                const klingTotal = isKlingMulti
                  ? klingTotalDuration(videoDuration, imageCount)
                  : null;
                const tooltip = isKlingMulti
                  ? `${videoDuration}s per shot × ${imageCount} images = ${klingTotal}s total`
                  : `${videoDuration}s`;
                return (
                  <div
                    className="inline-flex items-center gap-1.5 px-1.5"
                    title={tooltip}
                  >
                    <Clock
                      size={11}
                      className="text-[var(--color-muted)] flex-shrink-0"
                    />
                    <input
                      type="range"
                      min={durationConstraints.min}
                      max={durationConstraints.max}
                      step={durationConstraints.step}
                      value={videoDuration}
                      onChange={(e) =>
                        setVideoDuration(Number(e.target.value))
                      }
                      aria-label={
                        videoModel === "kling"
                          ? "Duration per shot in seconds"
                          : "Video duration in seconds"
                      }
                      className={cn(
                        "h-1 rounded-full cursor-pointer",
                        "accent-[var(--color-accent)]",
                        // Compact width fitting the toolbar; grows slightly
                        // on wider screens for finer control.
                        "w-16 sm:w-24",
                      )}
                    />
                    <span className="text-xs font-medium tabular-nums text-[var(--color-foreground)] text-right whitespace-nowrap">
                      {isKlingMulti
                        ? `${videoDuration}s × ${imageCount} = ${klingTotal}s`
                        : `${videoDuration}s`}
                    </span>
                  </div>
                );
              })()}

              {/* Voiceover icon toggle */}
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

              {/* Music icon toggle — ElevenLabs music muxed on the final video */}
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

        {/* Engine template picker — drives /api/engine/generate. The scene
            planner and per-shot Claude prompt writer decide model + duration
            per scene from this single choice. */}
        {mode === "video" && (
          <div className="relative flex items-center">
            <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
            <button
              type="button"
              onClick={() => setEngineTemplateOpen((prev) => !prev)}
              title="Template"
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-md",
                "text-xs font-medium transition-colors duration-150 outline-none",
                engineTemplateOpen
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-foreground)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]"
              )}
            >
              <LayoutTemplate size={12} className="shrink-0" />
              <span className="truncate max-w-[120px] sm:max-w-none">
                {ENGINE_TEMPLATE_META.find((t) => t.id === engineTemplate)?.label ?? engineTemplate}
              </span>
              <ChevronDown
                size={11}
                className={cn(
                  "transition-transform duration-150",
                  engineTemplateOpen && "rotate-180"
                )}
              />
            </button>
            <AnimatePresence>
              {engineTemplateOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12, ease: "easeOut" as const }}
                  className={cn(
                    "absolute bottom-full left-0 mb-2 z-50",
                    "w-64 rounded-xl overflow-hidden",
                    "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                    "shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
                  )}
                >
                  <div className="p-1.5">
                    {ENGINE_TEMPLATE_META.map((t) => {
                      const isSelected = engineTemplate === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setEngineTemplate(t.id);
                            setEngineTemplateOpen(false);
                          }}
                          className={cn(
                            "w-full flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg text-left",
                            "transition-colors duration-150",
                            isSelected
                              ? "bg-[var(--color-accent)]/10 text-[var(--color-foreground)]"
                              : "hover:bg-[var(--color-surface)] text-[var(--color-foreground)]"
                          )}
                        >
                          <span className="text-xs font-medium flex items-center gap-1.5">
                            {t.label}
                            {isSelected && (
                              <Check size={12} className="text-[var(--color-accent)]" />
                            )}
                          </span>
                          <span className="text-[10px] text-[var(--color-muted)] leading-tight">
                            {t.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Video model picker — sibling of the animated options block so its
            dropdown panel isn't clipped by that block's overflow-hidden. */}
        {mode === "video" && (
          <div ref={videoModelRef} className="relative flex items-center">
            <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
            <button
              type="button"
              onClick={() => setVideoModelOpen((prev) => !prev)}
              title="Video model"
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-md",
                "text-xs font-medium transition-colors duration-150 outline-none",
                videoModelOpen
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-foreground)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]"
              )}
            >
              <span className="truncate max-w-[80px] sm:max-w-none">
                {VIDEO_MODELS.find((m) => m.id === videoModel)?.label ?? "Model"}
              </span>
              <ChevronDown
                size={11}
                className={cn(
                  "transition-transform duration-150",
                  videoModelOpen && "rotate-180"
                )}
              />
            </button>

            <AnimatePresence>
              {videoModelOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12, ease: "easeOut" as const }}
                  className={cn(
                    "absolute bottom-full left-0 mb-2 z-50",
                    "w-56 rounded-xl overflow-hidden",
                    "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                    "shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
                  )}
                >
                  <div className="p-1.5">
                    {VIDEO_MODELS.map((m) => {
                      const isSelected = videoModel === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setVideoModel(m.id);
                            setVideoModelOpen(false);
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
                            {isSelected && (
                              <Check
                                size={13}
                                className="text-[var(--color-accent)]"
                              />
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
                              {m.label}
                            </p>
                            <p className="text-[11px] text-[var(--color-muted)] truncate mt-0.5">
                              {m.description}
                            </p>
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
              <span className="truncate">
                {aspectRatio}
              </span>
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

        {/* Separator */}
        {templates && templates.length > 0 && (
          <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
        )}

        {/* Templates dropdown — also hosts the Effects picker (Kling-only).
            A single "active" state on the trigger button covers either a
            style OR an effect being selected (spec §4: one accent indicator). */}
        {templates && templates.length > 0 && (
          <div ref={templatesRef} className="relative">
            <button
              type="button"
              onClick={() => setTemplatesOpen(!templatesOpen)}
              title="Templates"
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
                "text-xs font-medium transition-colors duration-150 outline-none",
                templatesOpen
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-foreground)]"
                  : selectedTemplateId || selectedEffectId
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30"
                    : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]"
              )}
            >
              <LayoutTemplate size={14} />
              <span className="hidden sm:inline">Templates</span>
            </button>

            <AnimatePresence>
              {templatesOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12, ease: "easeOut" as const }}
                  className={cn(
                    "absolute bottom-full left-0 mb-2 z-50",
                    "w-64 rounded-xl overflow-hidden",
                    "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                    "shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
                  )}
                >
                  <div className="p-1.5">
                    {/* STYLES — existing templates, unchanged behavior. */}
                    <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                      Styles
                    </p>
                    {templates.map((template) => {
                      const Icon =
                        TEMPLATE_ICONS[template.icon] ?? Sparkles;
                      const isSelected = selectedTemplateId === template.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => applyTemplate(template)}
                          className={cn(
                            "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left",
                            "transition-colors duration-150",
                            isSelected
                              ? "bg-[var(--color-accent)]/12 ring-1 ring-[var(--color-accent)]/25"
                              : "hover:bg-[var(--color-accent)]/8"
                          )}
                        >
                          <div
                            className={cn(
                              "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center",
                              "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                            )}
                          >
                            <Icon size={15} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-[var(--color-foreground)] truncate">
                              {template.name}
                            </p>
                            {template.description && (
                              <p className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-1">
                                {template.description}
                              </p>
                            )}
                          </div>
                          <span
                            className={cn(
                              "shrink-0 ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
                              template.tool === "video"
                                ? "bg-blue-500/10 text-blue-400"
                                : "bg-emerald-500/10 text-emerald-400"
                            )}
                          >
                            {template.tool}
                          </span>
                        </button>
                      );
                    })}

                    {/* EFFECTS — Kling only in v1. The section collapses
                        entirely (no header, no placeholder) when Seedance
                        is selected; silent clear on model switch handles
                        the "selected-but-hidden" case. */}
                    {videoModel === "kling" && (
                      <>
                        <div className="mx-2 my-1.5 border-t border-[var(--color-border)]" />
                        <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                          Effects
                          <span className="ml-1.5 text-[10px] font-normal normal-case tracking-normal text-[var(--color-muted)]/70">
                            (Kling only)
                          </span>
                        </p>
                        {VIDEO_EFFECTS.map((effect) => {
                          const Icon =
                            TEMPLATE_ICONS[effect.icon] ?? Sparkles;
                          const isSelected = selectedEffectId === effect.id;
                          return (
                            <button
                              key={effect.id}
                              type="button"
                              onClick={() => applyEffect(effect)}
                              className={cn(
                                "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left",
                                "transition-colors duration-150",
                                isSelected
                                  ? "bg-[var(--color-accent)]/12 ring-1 ring-[var(--color-accent)]/25"
                                  : "hover:bg-[var(--color-accent)]/8"
                              )}
                            >
                              <div
                                className={cn(
                                  "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center",
                                  "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                                )}
                              >
                                <Icon size={15} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-[var(--color-foreground)] truncate">
                                  {effect.name}
                                </p>
                                <p className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-1">
                                  {effect.description}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}
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
