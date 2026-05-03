"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { AspectRatioLabel, TargetAspectRatio } from "@/lib/aspect-ratio";

export interface AspectRatioMismatch {
  assetId: string;
  sourceLabel: AspectRatioLabel;
  sourceRatio: number;
  thumbnailUrl: string | null;
}

interface AspectRatioWarningModalProps {
  isOpen: boolean;
  mismatches: AspectRatioMismatch[];
  targetAspectRatio: TargetAspectRatio;
  onCancel: () => void;
  onConfirm: () => void;
}

export function AspectRatioWarningModal({
  isOpen,
  mismatches,
  targetAspectRatio,
  onCancel,
  onConfirm,
}: AspectRatioWarningModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onCancel]);

  // Body copy depends on which side is the odd one out — when the template is
  // landscape (16:9) the offending sources are portrait, and vice versa.
  const targetIsPortrait = targetAspectRatio === "9:16";
  const bodyText = targetIsPortrait
    ? t.creation.arWarningBodyPortrait
    : t.creation.arWarningBodyLandscape;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="ar-warning-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
            onClick={onCancel}
          />

          <motion.div
            key="ar-warning-panel"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.2, ease: "easeOut" as const }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ar-warning-title"
          >
            <div
              className={cn(
                "relative w-[calc(100%-2rem)] sm:w-full max-w-[480px] mx-auto pointer-events-auto",
                "rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]",
                "shadow-[0_32px_80px_rgba(0,0,0,0.7)] p-4 sm:p-5 flex flex-col gap-4",
                "max-h-[88vh] overflow-hidden",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
                  )}
                >
                  <AlertTriangle size={16} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2
                    id="ar-warning-title"
                    className="text-sm font-semibold text-[var(--color-foreground)]"
                  >
                    {t.creation.arWarningTitle}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
                    {bodyText}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  className={cn(
                    "w-8 h-8 flex shrink-0 items-center justify-center rounded-lg",
                    "text-[var(--color-muted)] hover:text-[var(--color-foreground)]",
                    "hover:bg-[var(--color-surface-raised)] transition-colors duration-150",
                  )}
                  aria-label={t.common.close}
                >
                  <X size={15} />
                </button>
              </div>

              <div className="overflow-x-auto pb-1 scrollbar-none">
                <div className="flex gap-2">
                  {mismatches.map((m) => (
                    <div
                      key={m.assetId}
                      className="relative shrink-0 flex flex-col items-center gap-1"
                    >
                      <div
                        className={cn(
                          "h-16 w-20 overflow-hidden rounded-lg",
                          "ring-1 ring-amber-500/40 bg-[var(--color-surface-raised)]",
                          "flex items-center justify-center",
                        )}
                      >
                        {m.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-[var(--color-muted)]">
                            {m.sourceLabel}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] tabular-nums font-mono text-amber-400">
                        {m.sourceLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onCancel}
                  className={cn(
                    "h-9 px-3 rounded-lg text-xs font-medium",
                    "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                    "text-[var(--color-foreground)]",
                    "hover:bg-[var(--color-surface)] transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                  )}
                >
                  {t.creation.arWarningCancel}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  className={cn(
                    "h-9 px-3 rounded-lg text-xs font-medium",
                    "bg-[var(--gold)] text-[var(--on-gold)]",
                    "shadow-[var(--shadow-gold)] hover:brightness-105 transition-[filter] duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                  )}
                >
                  {t.creation.arWarningProceed}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
