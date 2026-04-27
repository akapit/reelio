"use client";

import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";

interface LanguageSwitcherProps {
  compact?: boolean;
}

const options: Array<{ locale: Locale; key: "shortEnglish" | "shortHebrew" }> = [
  { locale: "en", key: "shortEnglish" },
  { locale: "he", key: "shortHebrew" },
];

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--bg-1)] p-0.5"
      aria-label={t.language.label}
      title={t.language.label}
    >
      {!compact && (
        <span className="px-1.5 text-[var(--fg-3)]">
          <Languages size={13} />
        </span>
      )}
      {options.map((option) => {
        const active = option.locale === locale;
        return (
          <button
            key={option.locale}
            type="button"
            onClick={() => setLocale(option.locale)}
            aria-pressed={active}
            className={cn(
              "h-7 rounded px-2 text-[11px] font-semibold tracking-[0.08em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]",
              active
                ? "bg-[var(--gold)] text-[var(--on-gold)]"
                : "text-[var(--fg-2)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)]",
            )}
          >
            {t.language[option.key]}
          </button>
        );
      })}
    </div>
  );
}
