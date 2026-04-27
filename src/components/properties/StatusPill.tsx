"use client";

export type Status = "published" | "rendering" | "draft";

interface StatusPillProps {
  status: Status;
}

const MAP: Record<
  Status,
  { label: string; color: string; dot: boolean; pulse?: boolean }
> = {
  published: {
    label: "Live",
    color: "var(--positive)",
    dot: true,
  },
  rendering: {
    label: "Rendering",
    color: "var(--gold-hi)",
    dot: true,
    pulse: true,
  },
  draft: {
    label: "Draft",
    color: "var(--fg-2)",
    dot: false,
  },
};

export function StatusPill({ status }: StatusPillProps) {
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
      {m.label}
    </span>
  );
}
