"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Surface the error to any error reporting service here
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[var(--color-background)]">
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="w-[400px] h-[400px] rounded-full bg-red-500/5 blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 text-center max-w-sm">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-red-500/10 border border-red-500/20">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-400"
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        {/* Divider */}
        <div className="w-12 h-px bg-gradient-to-r from-transparent via-[var(--color-border)] to-transparent" />

        {/* Copy */}
        <div className="space-y-2">
          <h1
            className="text-3xl font-semibold text-[var(--color-foreground)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Something went wrong
          </h1>
          <p className="text-sm text-[var(--color-muted)] leading-relaxed">
            An unexpected error occurred. You can try again or return to the
            dashboard.
          </p>
          {error.digest && (
            <p className="text-xs text-[var(--color-muted)]/60 font-mono mt-1">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/25 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 hover:border-[var(--color-accent)]/40 transition-colors duration-200"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:border-[var(--color-border)]/80 transition-colors duration-200"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
