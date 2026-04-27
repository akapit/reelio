"use client";

import Link from "next/link";
import { StatusPill, type Status } from "./StatusPill";
import { useI18n } from "@/lib/i18n/client";

interface PropertyCardProps {
  id: string;
  address: string;
  status?: Status;
  duration?: string; // e.g. "0:45"
  updated?: string; // e.g. "2h ago"
  views?: string; // e.g. "1.2k" or "—"
  thumbnailUrl?: string;
}

const TONES = ["warm", "cool", "amber", "sunset", "mono"] as const;
type Tone = (typeof TONES)[number];

// Deterministic tone-from-id so each property keeps the same gradient across
// renders/filters. Mirrors the design's tone variants on .prop-img.
function pickTone(seed: string): Tone {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

export function PropertyCard({
  id,
  address,
  status = "draft",
  duration,
  updated,
  views,
  thumbnailUrl,
}: PropertyCardProps) {
  const { t } = useI18n();
  const tone = pickTone(id || address);

  return (
    <Link
      href={`/dashboard/properties/${id}`}
      className="card group block overflow-hidden"
      style={{
        padding: 0,
        cursor: "pointer",
        transition:
          "transform .2s var(--ease), border-color .2s var(--ease), box-shadow .2s var(--ease)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "oklch(0.66 0.12 75 / 0.40)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--line-soft)";
      }}
    >
      {/* Thumbnail */}
      <div
        className="prop-img"
        data-tone={tone}
        style={{
          aspectRatio: "5 / 4",
          borderTopLeftRadius: 13,
          borderTopRightRadius: 13,
        }}
      >
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={address}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ borderTopLeftRadius: 13, borderTopRightRadius: 13 }}
          />
        )}

        {/* Status pill — top-start */}
        <div style={{ position: "absolute", top: 10, insetInlineStart: 10, zIndex: 1 }}>
          <StatusPill status={status} />
        </div>

        {/* Duration badge — bottom-end */}
        {duration && (
          <div
            className="mono"
            style={{
              position: "absolute",
              bottom: 10,
              insetInlineEnd: 10,
              fontSize: 11.5,
              letterSpacing: "0.14em",
              color: "oklch(0.95 0.02 80 / 0.85)",
              background: "oklch(0.10 0.01 70 / 0.55)",
              backdropFilter: "blur(4px)",
              padding: "3px 7px",
              borderRadius: 4,
              zIndex: 1,
            }}
          >
            {duration}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "14px 16px 16px" }}>
        <div
          className="serif"
          style={{
            fontSize: 18,
            lineHeight: 1.2,
            letterSpacing: "-0.015em",
            marginBottom: 4,
            color: "var(--fg-0)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {address}
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11.5,
            color: "var(--fg-3)",
            letterSpacing: "0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {address}
        </div>
        <div
          className="mono"
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "var(--fg-3)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          <span>{updated ?? "—"}</span>
          <span>{views && views !== "—" ? `${views} ${t.properties.views}` : "—"}</span>
        </div>
      </div>
    </Link>
  );
}
