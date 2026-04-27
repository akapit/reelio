"use client";

import { Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

interface PropertySearchProps {
  value: string;
  onChange: (v: string) => void;
}

export function PropertySearch({ value, onChange }: PropertySearchProps) {
  const { t } = useI18n();
  return (
    <div
      className="flex items-center gap-2"
      style={{
        height: 36,
        padding: "0 12px",
        borderRadius: 8,
        border: "1px solid var(--line-soft)",
        background: "var(--bg-1)",
        transition: "border-color .15s var(--ease)",
        width: 220,
      }}
      onFocus={(e) =>
        (e.currentTarget.style.borderColor = "oklch(0.66 0.12 75 / 0.5)")
      }
      onBlur={(e) =>
        (e.currentTarget.style.borderColor = "var(--line-soft)")
      }
    >
      <Search size={14} style={{ color: "var(--fg-2)" }} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.properties.searchPlaceholder}
        className="w-full bg-transparent outline-none border-0"
        style={{ fontSize: 13, color: "var(--fg-1)" }}
      />
    </div>
  );
}
