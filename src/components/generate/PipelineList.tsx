"use client";

import { Bell, Check } from "lucide-react";

export interface PipelineStep {
  k: string;
  d: string;
}

interface PipelineListProps {
  steps: PipelineStep[];
  activeIdx: number;
}

export function PipelineList({ steps, activeIdx }: PipelineListProps) {
  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="kicker" style={{ marginBottom: 14 }}>
        Pipeline
      </div>

      {steps.map((step, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;

        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              padding: "12px 0",
              borderTop: i ? "1px solid var(--line-soft)" : "none",
              opacity: i <= activeIdx ? 1 : 0.4,
              transition: "opacity 0.3s",
            }}
          >
            {/* Indicator circle */}
            <div
              style={{
                position: "relative",
                width: 22,
                height: 22,
                borderRadius: 999,
                flexShrink: 0,
                border:
                  "1px solid " +
                  (done
                    ? "var(--gold)"
                    : active
                      ? "var(--gold-hi)"
                      : "var(--line)"),
                background: done
                  ? "var(--gold-tint-2)"
                  : active
                    ? "oklch(0.66 0.12 75 / 0.10)"
                    : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color:
                  done || active ? "var(--gold-hi)" : "var(--fg-3)",
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
              }}
            >
              {done ? (
                <Check size={11} />
              ) : (
                (i + 1).toString().padStart(2, "0")
              )}
              {active && (
                <span
                  style={{
                    position: "absolute",
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border: "1px solid var(--gold-hi)",
                    animation: "pulse-dot 1.5s ease-in-out infinite",
                  }}
                />
              )}
            </div>

            {/* Label + status */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: i <= activeIdx ? "var(--fg-0)" : "var(--fg-2)",
                }}
              >
                {step.k}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 11.5,
                  letterSpacing: "0.04em",
                  color: "var(--fg-3)",
                  marginTop: 2,
                }}
              >
                {done ? "COMPLETE" : active ? "IN PROGRESS" : "QUEUED"}
              </div>
            </div>
          </div>
        );
      })}

      <div className="hr" style={{ margin: "14px 0" }} />

      <button
        type="button"
        style={{
          width: "100%",
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: "transparent",
          border: "1px solid var(--line)",
          borderRadius: 8,
          color: "var(--fg-1)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 0.15s var(--ease)",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--bg-2)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "transparent")
        }
      >
        <Bell size={14} /> Notify me when ready
      </button>
    </div>
  );
}
