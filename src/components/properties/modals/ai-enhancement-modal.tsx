"use client";

import { X as XIcon, Sparkles, Image as ImageIcon, Wand2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

type AIEnhancementType = "quality" | "expand" | "rearrange" | "clean" | "refurnish";

interface AIEnhancementOption {
  type: AIEnhancementType;
  Icon: React.ComponentType<{ className?: string }>;
}

const options: AIEnhancementOption[] = [
  { type: "quality", Icon: Sparkles },
  { type: "expand", Icon: ImageIcon },
  { type: "rearrange", Icon: Wand2 },
  { type: "clean", Icon: Sparkles },
  { type: "refurnish", Icon: Wand2 },
];

interface AIEnhancementModalProps {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
}

export function AIEnhancementModal({
  open,
  onClose,
  selectedCount,
}: AIEnhancementModalProps) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl md:p-7">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--fg-0)]">
            {t.modals.aiEnhancement}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--fg-3)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)]"
            aria-label={t.common.cancel}
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Selected-count subline */}
        <p className="mb-5 text-sm text-[var(--fg-2)]">
          {selectedCount} {t.modals.selectedPhotos}
        </p>

        {/* Options list */}
        <div className="space-y-2.5">
          {options.map(({ type, Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                console.log("TODO: wire to /api/process", type);
                onClose();
              }}
              className="group flex w-full items-center gap-4 rounded-xl border border-[var(--gold-tint-2)] bg-[var(--gold-tint)]/40 p-4 text-start transition-colors hover:bg-[var(--gold-tint)]/70"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[var(--gold-lo)] ring-1 ring-[var(--gold-tint-2)]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold leading-tight text-[var(--fg-0)]">
                  {t.modals.aiOptions[type].label}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--fg-2)]">
                  {t.modals.aiOptions[type].description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
