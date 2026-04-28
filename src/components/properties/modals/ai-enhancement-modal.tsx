"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  X as XIcon,
  Image as ImageIcon,
  Wand2,
  PenLine,
  ArrowRight,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import {
  PRESET_KEYS,
  type PresetKey,
} from "@/lib/ai/enhancement-presets";

const PRESET_ICONS: Record<PresetKey, React.ComponentType<{ className?: string }>> = {
  quality: Wand2,
  expand: ImageIcon,
  rearrange: Wand2,
  clean: Wand2,
  refurnish: Wand2,
};

const CUSTOM_PROMPT_MAX = 600;
const SESSION_KEY = "reelio:custom-ai-prompt";

export type PresetSelection =
  | { kind: "preset"; key: PresetKey }
  | { kind: "custom"; prompt: string };

interface AIEnhancementModalProps {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  onSelect?: (selection: PresetSelection) => void;
}

export function AIEnhancementModal({
  open,
  onClose,
  selectedCount,
  onSelect,
}: AIEnhancementModalProps) {
  const { t } = useI18n();
  const [showCustom, setShowCustom] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.sessionStorage.getItem(SESSION_KEY) ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleClose = () => {
    setShowCustom(false);
    onClose();
  };

  const handlePresetClick = (key: PresetKey) => {
    onSelect?.({ kind: "preset", key });
    setShowCustom(false);
    onClose();
  };

  const handleCustomSubmit = () => {
    const trimmed = customPrompt.trim();
    if (trimmed.length === 0) return;
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(SESSION_KEY, trimmed);
      } catch {
        // ignore
      }
    }
    onSelect?.({ kind: "custom", prompt: trimmed });
    setShowCustom(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t.modals.aiEnhancement}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.99 0.006 82) 0%, oklch(0.975 0.008 80) 100%)",
          border: "1px solid var(--line-soft)",
          boxShadow: "var(--shadow-card), 0 24px 48px -12px oklch(0.20 0.01 70 / 0.18)",
        }}
      >
        {/* Subtle gold ribbon at the very top of the dialog */}
        <div
          aria-hidden="true"
          style={{
            height: 2,
            background:
              "linear-gradient(90deg, transparent, var(--gold-hi) 50%, transparent)",
            opacity: 0.55,
          }}
        />

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4">
          <div>
            <div
              className="kicker"
              style={{ color: "var(--gold-lo)", marginBottom: 4 }}
            >
              {t.modals.aiKicker}
            </div>
            <h2
              className="serif"
              style={{
                fontSize: 24,
                lineHeight: 1.1,
                letterSpacing: "-0.018em",
                color: "var(--fg-0)",
                margin: 0,
              }}
            >
              {t.modals.aiEnhancement}
            </h2>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 12.5,
                color: "var(--fg-2)",
              }}
            >
              {selectedCount} {t.modals.selectedPhotos}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-[var(--fg-3)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)]"
            aria-label={t.common.cancel}
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Faint separator */}
        <div
          aria-hidden="true"
          style={{
            height: 1,
            margin: "0 24px",
            background: "var(--line-soft)",
          }}
        />

        {/* Options list */}
        <div className="px-5 pb-5 pt-4">
          <ul className="flex flex-col gap-2">
            {PRESET_KEYS.map((key, idx) => {
              const Icon = PRESET_ICONS[key];
              const opt = t.modals.aiOptions[key];
              return (
                <motion.li
                  key={key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.22,
                    delay: 0.05 + idx * 0.04,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handlePresetClick(key)}
                    className="group flex w-full items-center gap-4 rounded-xl border border-[var(--gold-tint-2)] bg-[var(--gold-tint)]/30 p-3.5 text-start transition-all hover:bg-[var(--gold-tint)]/60 hover:shadow-[0_4px_18px_-8px_oklch(0.66_0.12_75/0.35)]"
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[var(--gold-lo)] ring-1 ring-[var(--gold-tint-2)]"
                      style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.5)" }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="serif block leading-tight text-[var(--fg-0)]"
                        style={{ fontSize: 16, letterSpacing: "-0.01em" }}
                      >
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--fg-2)]">
                        {opt.description}
                      </span>
                    </span>
                    <ArrowRight
                      size={15}
                      className="shrink-0 text-[var(--fg-3)] transition-colors rtl:rotate-180 group-hover:text-[var(--gold)]"
                    />
                  </button>
                </motion.li>
              );
            })}

            {/* Custom prompt card */}
            <motion.li
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.22,
                delay: 0.05 + PRESET_KEYS.length * 0.04,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div
                className="rounded-xl border-2 border-dashed border-[var(--line)] bg-[var(--bg-1)] p-3.5 transition-colors"
                style={{
                  borderColor: showCustom ? "var(--gold)" : undefined,
                  background: showCustom
                    ? "var(--gold-tint)"
                    : undefined,
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowCustom((v) => !v)}
                  className="flex w-full items-center gap-4 text-start"
                  aria-expanded={showCustom}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[var(--gold-lo)] ring-1 ring-[var(--gold-tint-2)]">
                    <PenLine className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="serif block leading-tight text-[var(--fg-0)]"
                      style={{ fontSize: 16, letterSpacing: "-0.01em" }}
                    >
                      {t.modals.aiOptions.custom.label}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--fg-2)]">
                      {t.modals.aiOptions.custom.description}
                    </span>
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {showCustom && (
                    <motion.div
                      key="custom-input"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="pt-3">
                        <textarea
                          value={customPrompt}
                          onChange={(e) =>
                            setCustomPrompt(
                              e.target.value.slice(0, CUSTOM_PROMPT_MAX),
                            )
                          }
                          rows={3}
                          maxLength={CUSTOM_PROMPT_MAX}
                          placeholder={t.modals.aiOptions.custom.placeholder}
                          className="w-full resize-none rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2 text-[13px] leading-relaxed text-[var(--fg-0)] placeholder-[var(--fg-3)] outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-tint-2)]"
                        />
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span
                            className="mono text-[11px]"
                            style={{
                              color:
                                customPrompt.length >= CUSTOM_PROMPT_MAX - 30
                                  ? "var(--gold-lo)"
                                  : "var(--fg-3)",
                            }}
                          >
                            {customPrompt.length}/{CUSTOM_PROMPT_MAX}
                          </span>
                          <button
                            type="button"
                            onClick={handleCustomSubmit}
                            disabled={customPrompt.trim().length === 0}
                            className="btn-generate"
                          >
                            {t.modals.aiSubmit}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
