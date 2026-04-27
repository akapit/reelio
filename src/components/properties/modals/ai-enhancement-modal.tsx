"use client";

import { X as XIcon, Sparkles, Image as ImageIcon, Wand2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

type AIEnhancementType = "quality" | "expand" | "rearrange" | "clean" | "refurnish";

interface AIEnhancementOption {
  type: AIEnhancementType;
  Icon: React.ComponentType<{ className?: string }>;
}

const options: AIEnhancementOption[] = [
  {
    type: "quality",
    Icon: Sparkles,
  },
  {
    type: "expand",
    Icon: ImageIcon,
  },
  {
    type: "rearrange",
    Icon: Wand2,
  },
  {
    type: "clean",
    Icon: Sparkles,
  },
  {
    type: "refurnish",
    Icon: Wand2,
  },
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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">{t.modals.aiEnhancement}</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {selectedCount} {t.modals.selectedPhotos}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-stone-100"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {options.map(({ type, Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                console.log("TODO: wire to /api/process", type);
                onClose();
              }}
              className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-slate-50 to-stone-50 rounded-xl border border-stone-200 hover:border-amber-400 hover:from-amber-50 hover:to-stone-50 transition-all text-start group"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200 transition-colors">
                <Icon className="w-5 h-5 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {t.modals.aiOptions[type].label}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.modals.aiOptions[type].description}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Cancel */}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 px-4 py-2.5 bg-stone-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors"
        >
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
}
