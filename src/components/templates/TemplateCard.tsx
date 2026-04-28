"use client";

import { Check } from "lucide-react";
import type { Template } from "@/hooks/use-templates";
import { TEMPLATE_META, FALLBACK_META } from "./template-meta";

interface TemplateCardProps {
  template: Template;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
  const meta = TEMPLATE_META[template.id] ?? FALLBACK_META;

  return (
    <div
      className="card"
      onClick={() => onSelect(template.id)}
      style={{
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        borderColor: selected ? "var(--gold)" : "var(--line-soft)",
        boxShadow: selected
          ? "0 0 0 3px oklch(0.66 0.12 75 / 0.18)"
          : "none",
        transition: "all .2s var(--ease)",
      }}
    >
      {/* Top image region */}
      <div
        className="prop-img"
        data-tone={meta.tone}
        style={{
          aspectRatio: "5 / 4",
          borderRadius: 0,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Centered template name */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="serif"
            style={{
              fontSize: 28,
              color: "oklch(0.97 0.02 80 / 0.92)",
              letterSpacing: "-0.01em",
            }}
          >
            {template.name}
          </div>
        </div>

        {/* Style label — top-start */}
        <div
          className="mono"
          style={{
            position: "absolute",
            top: 10,
            insetInlineStart: 12,
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "oklch(0.95 0.02 80 / 0.6)",
          }}
        >
          {meta.style}
        </div>

        {/* Duration label — top-end */}
        <div
          className="mono"
          style={{
            position: "absolute",
            top: 10,
            insetInlineEnd: 12,
            fontSize: 12,
            letterSpacing: "0.14em",
            color: "var(--gold-hi)",
          }}
        >
          {meta.durationLabel}
        </div>

        {/* Selected checkmark — bottom-end */}
        {selected && (
          <div
            style={{
              position: "absolute",
              bottom: 10,
              insetInlineEnd: 10,
              width: 22,
              height: 22,
              borderRadius: 999,
              background: "var(--gold)",
              color: "var(--on-gold)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Check size={12} />
          </div>
        )}
      </div>

      {/* Bottom description region */}
      <div style={{ padding: "12px 14px 16px" }}>
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.45,
            color: "var(--fg-1)",
          }}
        >
          {template.description}
        </div>
      </div>
    </div>
  );
}
