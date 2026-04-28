"use client";

import { useEffect } from "react";
import { motion } from "motion/react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  children: React.ReactNode;
}

/**
 * Bottom sheet that slides up from the bottom edge. Full-width, max-height
 * 90vh, with a grab handle. Overlay-tap and Escape both dismiss.
 */
export function Sheet({ open, onClose, ariaLabel, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-h-[90vh] overflow-y-auto"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.99 0.006 82) 0%, oklch(0.975 0.008 80) 100%)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTop: "1px solid var(--line-soft)",
          borderInlineStart: "1px solid var(--line-soft)",
          borderInlineEnd: "1px solid var(--line-soft)",
          boxShadow:
            "0 -8px 32px -12px oklch(0.20 0.01 70 / 0.30)",
        }}
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-3 mb-1"
          style={{
            width: 36,
            height: 4,
            borderRadius: 999,
            background: "var(--line)",
          }}
        />
        {children}
      </motion.div>
    </div>
  );
}
