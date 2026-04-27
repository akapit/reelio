"use client";

import { useI18n } from "@/lib/i18n/client";

export type Status = "published" | "rendering" | "draft";

interface StatusPillProps {
  status: Status;
}

const MAP: Record<
  Status,
  { color: string; dot: boolean; pulse?: boolean }
> = {
  published: {
    color: "var(--positive)",
    dot: true,
  },
  rendering: {
    color: "var(--gold-hi)",
    dot: true,
    pulse: true,
  },
  draft: {
    color: "var(--fg-2)",
    dot: false,
  },
};

export function StatusPill({ status }: StatusPillProps) {
  const { t } = useI18n();
  const m = MAP[status];
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: m.color,
        padding: "3px 8px",
        border: "1px solid var(--line-soft)",
        borderRadius: 999,
        background: "var(--bg-1)",
      }}
    >
      {m.dot && (
        <span
          className={m.pulse ? "pulse-dot" : undefined}
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: m.color,
          }}
        />
      )}
      {t.status[status]}
    </span>
  );
}
