"use client";

import { X as XIcon, Sparkles, Image as ImageIcon, Wand2 } from "lucide-react";

interface AIEnhancementOption {
  type: "quality" | "expand" | "rearrange" | "clean" | "refurnish";
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const options: AIEnhancementOption[] = [
  {
    type: "quality",
    label: "שיפור איכות",
    description: "הגדל חדות, הבהרת צבעים, פרטים",
    Icon: Sparkles,
  },
  {
    type: "expand",
    label: "הרחבת תמונה",
    description: "הוסף רקע מסביב לתמונה",
    Icon: ImageIcon,
  },
  {
    type: "rearrange",
    label: "סידור חדר מחדש",
    description: "ייעל את פריסת הריהוט בחדר",
    Icon: Wand2,
  },
  {
    type: "clean",
    label: "חדר נקי",
    description: "הסר חפצים ועומס מהתמונה",
    Icon: Sparkles,
  },
  {
    type: "refurnish",
    label: "ריהוט מחדש",
    description: "החלף ריהוט בסגנון חדש ומודרני",
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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">שדרוג AI</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {selectedCount} תמונות נבחרו
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
          {options.map(({ type, label, description, Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                console.log("TODO: wire to /api/process", type);
                onClose();
              }}
              className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-slate-50 to-stone-50 rounded-xl border border-stone-200 hover:border-amber-400 hover:from-amber-50 hover:to-stone-50 transition-all text-right group"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200 transition-colors">
                <Icon className="w-5 h-5 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{description}</p>
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
          ביטול
        </button>
      </div>
    </div>
  );
}
