"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DEFAULT_LOCALE,
  dirForLocale,
  isLocale,
  type Direction,
  type Locale,
} from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";

interface I18nContextValue {
  locale: Locale;
  dir: Direction;
  t: Dictionary;
  setLocale: (locale: Locale) => Promise<void>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = dirForLocale(locale);
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(
    isLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE,
  );

  const setLocale = useCallback(
    async (nextLocale: Locale) => {
      if (!isLocale(nextLocale)) return;
      setLocaleState(nextLocale);
      applyDocumentLocale(nextLocale);

      try {
        const res = await fetch("/api/preferences/language", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: nextLocale }),
        });
        if (!res.ok) throw new Error("Failed to save language");
      } catch {
        toast.error(dictionaries[nextLocale].common.error);
      } finally {
        router.refresh();
      }
    },
    [router],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: dirForLocale(locale),
      t: dictionaries[locale],
      setLocale,
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
