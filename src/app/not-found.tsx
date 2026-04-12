import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[var(--color-background)]">
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="w-[480px] h-[480px] rounded-full bg-[var(--color-accent)]/5 blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 text-center max-w-md">
        {/* 404 numeral */}
        <span
          className="text-[120px] font-semibold leading-none select-none bg-gradient-to-b from-[var(--color-accent)]/60 to-[var(--color-accent)]/10 bg-clip-text text-transparent"
          style={{ fontFamily: "var(--font-display)" }}
        >
          404
        </span>

        {/* Divider */}
        <div className="w-16 h-px bg-gradient-to-r from-transparent via-[var(--color-accent)]/40 to-transparent" />

        {/* Copy */}
        <div className="space-y-2">
          <h1
            className="text-3xl font-semibold text-[var(--color-foreground)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Page not found
          </h1>
          <p className="text-sm text-[var(--color-muted)] leading-relaxed">
            The page you are looking for does not exist or may have been moved.
          </p>
        </div>

        {/* CTA */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/25 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 hover:border-[var(--color-accent)]/40 transition-colors duration-200"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
