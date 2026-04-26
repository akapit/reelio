"use client";

import { useState, useEffect } from "react";
import { Sparkles, Copy, Share2 } from "lucide-react";
import type { PropertyData } from "../property-detail";

function generateSmartCopy(data: PropertyData): string {
  const parts: string[] = [];

  const address = [
    data.street,
    data.streetNumber,
    data.neighborhood,
    data.city,
  ]
    .filter(Boolean)
    .join(" ");

  if (address) {
    parts.push(`🏠 ${data.propertyType || "נכס"} למכירה${address ? ` ב${address}` : ""}`);
  } else {
    parts.push(`🏠 ${data.propertyType || "נכס"} מדהים למכירה!`);
  }

  parts.push("");

  const details: string[] = [];
  if (data.rooms) details.push(`🛏️ ${data.rooms} חדרים`);
  if (data.size) details.push(`📐 ${data.size} מ"ר`);
  if (data.floor && data.totalFloors) {
    details.push(`🏢 קומה ${data.floor} מתוך ${data.totalFloors}`);
  } else if (data.floor) {
    details.push(`🏢 קומה ${data.floor}`);
  }
  if (data.price) details.push(`💰 ${data.price} ₪`);

  if (details.length > 0) {
    parts.push(...details);
    parts.push("");
  }

  if (data.description) {
    parts.push("✨ על הנכס:");
    parts.push(data.description);
    parts.push("");
  }

  if (data.features.length > 0) {
    parts.push("🌟 מה תמצאו כאן:");
    data.features.forEach((f) => parts.push(`✅ ${f}`));
    parts.push("");
  }

  const ownerName = [data.ownerFirstName, data.ownerLastName]
    .filter(Boolean)
    .join(" ");
  if (ownerName || data.ownerPhone) {
    parts.push("📞 ליצירת קשר:");
    if (ownerName) parts.push(`👤 ${ownerName}`);
    if (data.ownerPhone) parts.push(`📱 ${data.ownerPhone}`);
    parts.push("");
  }

  parts.push("#נדלן #ישראל #נכסים");
  if (data.city) parts.push(`#${data.city.replace(/\s/g, "")}`);
  if (data.propertyType) parts.push(`#${data.propertyType.replace(/\s/g, "")}`);

  return parts.join("\n");
}

interface CopyTabProps {
  data: PropertyData;
  onChange: (patch: Partial<PropertyData>) => void;
}

export function CopyTab({ data }: CopyTabProps) {
  const [copyText, setCopyText] = useState(() => generateSmartCopy(data));
  const [copied, setCopied] = useState(false);

  // Regenerate when data changes (not on every keystroke in textarea)
  const regenerate = () => {
    setCopyText(generateSmartCopy(data));
  };

  // Auto-generate once on mount
  useEffect(() => {
    setCopyText(generateSmartCopy(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the textarea
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header + regenerate */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">קופי שיווקי</h2>
        <button
          type="button"
          onClick={regenerate}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg text-sm font-medium hover:from-purple-700 hover:to-purple-800 transition-all shadow-sm"
        >
          <Sparkles className="w-4 h-4" />
          צור מחדש
        </button>
      </div>

      {/* Copy card */}
      <div className="p-4 md:p-5 bg-gradient-to-br from-amber-50 to-stone-50 rounded-xl border border-amber-200/50">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={handleCopy}
            title="העתק ללוח"
            className="p-1.5 text-slate-500 hover:text-amber-700 transition-colors rounded"
          >
            <Copy className="w-4 h-4" />
          </button>
          {copied && (
            <span className="text-xs text-amber-700 font-medium">הועתק!</span>
          )}
        </div>
        <textarea
          value={copyText}
          onChange={(e) => setCopyText(e.target.value)}
          rows={18}
          dir="rtl"
          className="w-full bg-transparent text-right text-sm text-slate-800 leading-relaxed resize-none focus:outline-none placeholder-slate-400"
          placeholder="לחץ על 'צור מחדש' כדי לייצר קופי שיווקי..."
        />
      </div>

      {/* Share button */}
      <button
        type="button"
        onClick={() => console.log("TODO: share copy text", copyText)}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-lg font-medium hover:from-amber-700 hover:to-amber-800 transition-all shadow-md"
      >
        <Share2 className="w-5 h-5" />
        שתף קופי
      </button>
    </div>
  );
}
