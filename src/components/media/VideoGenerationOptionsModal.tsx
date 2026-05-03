"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Mic, Music, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

export interface VideoGenerationOptions {
  durationSec: number;
  voiceoverText?: string;
  musicPrompt?: string;
  musicVolume?: number;
}

interface VideoGenerationOptionsModalProps {
  isOpen: boolean;
  imageCount: number;
  minImages?: number;
  maxImages?: number;
  onClose: () => void;
  onConfirm: (options: VideoGenerationOptions) => Promise<void> | void;
}

const DEFAULT_MUSIC_PROMPT = "Soft ambient piano, luxury real estate";
const DEFAULT_MUSIC_VOLUME = 20;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function durationDefaults(imageCount: number) {
  const maxSeconds = Math.max(1, Math.min(50, imageCount * 3));
  const minSeconds = Math.min(maxSeconds, Math.max(1, imageCount * 2));
  const defaultSeconds = clamp(
    Math.round(imageCount * 2.5),
    minSeconds,
    maxSeconds,
  );
  return { minSeconds, maxSeconds, defaultSeconds };
}

export function VideoGenerationOptionsModal({
  isOpen,
  imageCount,
  minImages = 6,
  maxImages = 20,
  onClose,
  onConfirm,
}: VideoGenerationOptionsModalProps) {
  const { t, dir } = useI18n();
  const { minSeconds, maxSeconds, defaultSeconds } = useMemo(
    () => durationDefaults(imageCount),
    [imageCount],
  );
  const [durationSec, setDurationSec] = useState(defaultSeconds);
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(false);
  const [voiceoverText, setVoiceoverText] = useState("");
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState(DEFAULT_MUSIC_PROMPT);
  const [musicVolume, setMusicVolume] = useState(DEFAULT_MUSIC_VOLUME);
  const [submitting, setSubmitting] = useState(false);

  const hasEnoughImages = imageCount >= minImages;
  const withinImageLimit = imageCount <= maxImages;
  const canConfirm = hasEnoughImages && withinImageLimit && !submitting;

  useEffect(() => {
    if (!isOpen) return;
    const next = durationDefaults(imageCount);
    setDurationSec(next.defaultSeconds);
    setVoiceoverEnabled(false);
    setVoiceoverText("");
    setMusicEnabled(false);
    setMusicPrompt(DEFAULT_MUSIC_PROMPT);
    setMusicVolume(DEFAULT_MUSIC_VOLUME);
    setSubmitting(false);
  }, [imageCount, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, submitting]);

  async function handleSubmit() {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm({
        durationSec,
        voiceoverText: voiceoverEnabled
          ? voiceoverText.trim() || undefined
          : undefined,
        ...(musicEnabled
          ? {
              musicPrompt: musicPrompt.trim() || DEFAULT_MUSIC_PROMPT,
              musicVolume: musicVolume / 100,
            }
          : {}),
      });
    } catch (err) {
      console.warn("[video-options] confirm failed", err);
    } finally {
      setSubmitting(false);
    }
  }

  const quickDurations = [
    { label: t.creation.durationTwoPerPhoto, value: imageCount * 2 },
    { label: t.creation.durationTwoHalfPerPhoto, value: imageCount * 2.5 },
    { label: t.creation.durationThreePerPhoto, value: imageCount * 3 },
  ].map((option) => ({
    ...option,
    value: clamp(Math.round(option.value), minSeconds, maxSeconds),
  }));

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="video-options-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => !submitting && onClose()}
          />
          <motion.div
            key="video-options-panel"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: "easeOut" as const }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-lg rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-1)] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="serif text-2xl text-[var(--fg-0)]">
                    {t.creation.videoOptionsTitle}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--fg-2)]">
                    {t.creation.videoOptionsDescription.replace(
                      "{count}",
                      String(imageCount),
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--fg-3)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t.common.close}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-5 space-y-5">
                {(!hasEnoughImages || !withinImageLimit) && (
                  <div className="rounded-lg border border-[var(--gold-tint-2)] bg-[var(--gold-tint)] px-3 py-2 text-sm text-[var(--fg-0)]">
                    {!hasEnoughImages
                      ? t.creation.videoMinImagesRequired.replace(
                          "{count}",
                          String(minImages),
                        )
                      : t.creation.videoMaxImagesAllowed.replace(
                          "{count}",
                          String(maxImages),
                        )}
                  </div>
                )}

                <section className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <label className="text-sm font-semibold text-[var(--fg-0)]">
                      {t.creation.duration}
                    </label>
                    <span className="mono text-xs text-[var(--fg-2)]">
                      {minSeconds}-{maxSeconds}s
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={minSeconds}
                      max={maxSeconds}
                      value={durationSec}
                      onChange={(event) =>
                        setDurationSec(Number(event.target.value))
                      }
                      className="min-w-0 flex-1 accent-[var(--gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
                      aria-label={t.creation.duration}
                    />
                    <label className="sr-only" htmlFor="video-duration-seconds">
                      {t.creation.duration}
                    </label>
                    <input
                      id="video-duration-seconds"
                      type="number"
                      min={minSeconds}
                      max={maxSeconds}
                      value={durationSec}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (!Number.isFinite(next)) return;
                        setDurationSec(clamp(next, minSeconds, maxSeconds));
                      }}
                      className="h-10 w-20 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-2)] px-2 text-center text-sm text-[var(--fg-0)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {quickDurations.map((option, index) => (
                      <button
                        key={`${option.label}-${index}`}
                        type="button"
                        onClick={() => setDurationSec(option.value)}
                        className={cn(
                          "rounded-lg border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]",
                          durationSec === option.value
                            ? "border-[var(--gold)] bg-[var(--gold-tint)] text-[var(--gold-lo)]"
                            : "border-[var(--line-soft)] bg-[var(--bg-2)] text-[var(--fg-2)] hover:border-[var(--gold)]/60 hover:text-[var(--fg-0)]",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <ToggleRow
                    enabled={musicEnabled}
                    onChange={setMusicEnabled}
                    icon={<Music size={15} />}
                    label={t.creation.musicOff}
                    activeLabel={t.creation.musicOn}
                    dir={dir}
                  />
                  {musicEnabled && (
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <div className="flex h-10 items-center rounded-lg border border-[var(--line-soft)] bg-[var(--bg-2)] px-3 text-sm text-[var(--fg-2)]">
                        {t.creation.musicRepoTrack}
                      </div>
                      <label className="flex items-center gap-2 text-xs text-[var(--fg-2)]">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={musicVolume}
                          onChange={(event) =>
                            setMusicVolume(Number(event.target.value))
                          }
                          className="w-24 accent-[var(--gold)]"
                          aria-label={t.creation.musicVolume}
                        />
                        <span className="mono w-8 tabular-nums">
                          {musicVolume}%
                        </span>
                      </label>
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <ToggleRow
                    enabled={voiceoverEnabled}
                    onChange={setVoiceoverEnabled}
                    icon={<Mic size={15} />}
                    label={t.creation.voiceoverOff}
                    activeLabel={t.creation.voiceoverOn}
                    dir={dir}
                  />
                  {voiceoverEnabled && (
                    <textarea
                      rows={4}
                      maxLength={2000}
                      value={voiceoverText}
                      onChange={(event) => setVoiceoverText(event.target.value)}
                      placeholder={t.creation.voiceoverPlaceholder}
                      className="w-full resize-none rounded-lg border border-[var(--line-soft)] bg-[var(--bg-2)] px-3 py-2.5 text-sm text-[var(--fg-0)] placeholder:text-[var(--fg-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
                    />
                  )}
                </section>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="h-10 rounded-lg border border-[var(--line-soft)] px-4 text-sm font-medium text-[var(--fg-2)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canConfirm}
                  className={cn(
                    "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-[background-color,filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]",
                    canConfirm
                      ? "bg-[var(--gold)] text-[var(--on-gold)] hover:brightness-105"
                      : "cursor-not-allowed bg-[var(--bg-2)] text-[var(--fg-3)]",
                  )}
                >
                  {submitting && <Loader2 size={15} className="animate-spin" />}
                  {t.creation.confirmVideoGeneration}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ToggleRow({
  enabled,
  onChange,
  icon,
  label,
  activeLabel,
  dir,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  icon: ReactNode;
  label: string;
  activeLabel: string;
  dir: "ltr" | "rtl";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-2)] px-3 py-2.5 text-start transition-colors hover:border-[var(--gold)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
    >
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--fg-0)]">
        <span className={enabled ? "text-[var(--gold-lo)]" : "text-[var(--fg-3)]"}>
          {icon}
        </span>
        <span>{enabled ? activeLabel : label}</span>
      </span>
      <span
        className={cn(
          "relative h-5 w-10 shrink-0 rounded-full transition-colors",
          enabled ? "bg-[var(--gold)]" : "bg-[var(--line)]",
        )}
      >
        <span
          className={cn(
            "absolute start-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            dir === "rtl"
              ? enabled
                ? "-translate-x-5"
                : "translate-x-0"
              : enabled
                ? "translate-x-5"
                : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
