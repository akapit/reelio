"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { BeforeAfterSlider } from "@/components/media/BeforeAfterSlider";
import { useI18n } from "@/lib/i18n/client";

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalUrl: string;
  processedUrl: string;
}

export function CompareModal({
  isOpen,
  onClose,
  originalUrl,
  processedUrl,
}: CompareModalProps) {
  const { t } = useI18n();
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ duration: 0.22, ease: "easeOut" as const }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="relative w-[calc(100%-2rem)] sm:w-full max-w-4xl mx-auto pointer-events-auto rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[0_32px_80px_rgba(0,0,0,0.7)] p-4 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h2
                  className="text-2xl font-semibold text-[var(--color-foreground)]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {t.media.beforeAfter}
                </h2>

                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
                  aria-label={t.common.close}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Slider */}
              <BeforeAfterSlider
                originalUrl={originalUrl}
                processedUrl={processedUrl}
                className="w-full aspect-video"
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
