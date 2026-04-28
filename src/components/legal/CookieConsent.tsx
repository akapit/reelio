"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

const STORAGE_KEY = "reelio_cookie_consent";

type Choice = "accepted" | "declined";

export function CookieConsent() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function persist(choice: Choice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Storage unavailable (private mode) — fall back to in-memory dismissal.
    }
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-live="polite"
          aria-label={t.legal.cookieTitle}
          className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-1)] p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--fg-0)]">
                {t.legal.cookieTitle}
              </p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {t.legal.cookieMessage}{" "}
                <Link
                  href="/privacy"
                  className="text-[var(--color-foreground)] underline underline-offset-2 transition-colors duration-150 hover:text-[var(--color-accent)]"
                >
                  {t.legal.cookieLearnMore}
                </Link>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => persist("declined")}
              >
                {t.legal.cookieDecline}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => persist("accepted")}
              >
                {t.legal.cookieAccept}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
