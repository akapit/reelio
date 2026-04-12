"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalUrl: string;
  processedUrl?: string | null;
  assetType?: "image" | "video";
}

type Tab = "original" | "enhanced";

export function PreviewModal({
  isOpen,
  onClose,
  originalUrl,
  processedUrl,
  assetType = "image",
}: PreviewModalProps) {
  const hasBoth = !!originalUrl && !!processedUrl;
  const [activeTab, setActiveTab] = useState<Tab>("original");

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

  const currentUrl =
    hasBoth && activeTab === "enhanced" ? processedUrl! : originalUrl;

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
              className="relative w-full max-w-5xl pointer-events-auto rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[0_32px_80px_rgba(0,0,0,0.7)] p-4 flex flex-col gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header row: tabs (or title placeholder) + close button */}
              <div className="flex items-center justify-between gap-3">
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

              {/* Media area */}
              <div className="flex items-center justify-center bg-[var(--color-surface-raised)] rounded-xl overflow-hidden">
                {assetType === "video" ? (
                  <video
                    key={currentUrl}
                    src={currentUrl}
                    controls
                    className="max-w-full max-h-[85vh] object-contain rounded-xl"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={currentUrl}
                    src={currentUrl}
                    alt="Asset preview"
                    className="max-w-full max-h-[85vh] object-contain rounded-xl"
                  />
                )}
              </div>

              {/* Footer: download button */}
              <div className="flex items-center justify-end">
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                    "bg-[var(--color-surface-raised)] border border-[var(--color-border)]",
                    "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:border-[var(--color-accent)]",
                    "transition-colors duration-150"
                  )}
                >
                  <Download size={13} />
                  Download
                </a>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
