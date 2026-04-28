"use client";

interface LivePreviewCardProps {
  projectTitle: string;
  projectAddress: string;
  percent: number;
  stepName: string;
  stepDescription: string;
}

const CORNERS = ["tl", "tr", "bl", "br"] as const;
type Corner = (typeof CORNERS)[number];

function getCornerStyle(pos: Corner): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 14,
    height: 14,
    borderTop: pos.startsWith("t") ? "1px solid var(--gold-hi)" : "none",
    borderBottom: pos.startsWith("b") ? "1px solid var(--gold-hi)" : "none",
    borderLeft: pos.endsWith("l") ? "1px solid var(--gold-hi)" : "none",
    borderRight: pos.endsWith("r") ? "1px solid var(--gold-hi)" : "none",
  };
  if (pos === "tl") return { ...base, top: 10, left: 10 };
  if (pos === "tr") return { ...base, top: 10, right: 10 };
  if (pos === "bl") return { ...base, bottom: 10, left: 10 };
  return { ...base, bottom: 10, right: 10 };
}

export function LivePreviewCard({
  projectTitle,
  projectAddress,
  percent,
  stepName,
  stepDescription,
}: LivePreviewCardProps) {
  const mm = Math.floor(percent * 0.6)
    .toString()
    .padStart(2, "0");

  return (
    <div className="card" style={{ padding: 18 }}>
      <div
        className="prop-img"
        data-tone="warm"
        style={{
          aspectRatio: "4 / 5",
          borderRadius: 10,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Scanline */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 1.5,
            background:
              "linear-gradient(90deg, transparent, var(--gold-hi), transparent)",
            boxShadow: "0 0 16px var(--gold), 0 0 8px var(--gold-hi)",
            animation: "scanline 2.6s linear infinite",
          }}
        />

        {/* Corner reticles */}
        {CORNERS.map((pos) => (
          <div key={pos} style={getCornerStyle(pos)} />
        ))}

        {/* Top row: REC + aperture */}
        <div
          style={{
            position: "absolute",
            left: 18,
            top: 18,
            right: 18,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 11.5,
              letterSpacing: "0.18em",
              color: "oklch(0.95 0.02 80 / 0.7)",
              textTransform: "uppercase",
            }}
          >
            ● REC · 00:{mm}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 11.5,
              letterSpacing: "0.18em",
              color: "var(--gold-hi)",
              textTransform: "uppercase",
            }}
          >
            f/2.8 · 35mm
          </span>
        </div>

        {/* Bottom block: title + address */}
        <div
          style={{
            position: "absolute",
            left: 18,
            right: 18,
            bottom: 18,
          }}
        >
          <div
            className="serif"
            style={{
              fontSize: 28,
              color: "oklch(0.97 0.02 80)",
              lineHeight: 1.1,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
            }}
          >
            {projectTitle}
          </div>
          <div
            className="mono"
            style={{
              fontSize: 11.5,
              letterSpacing: "0.16em",
              color: "oklch(0.95 0.02 80 / 0.7)",
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            {projectAddress}
          </div>
        </div>
      </div>

      {/* Progress section */}
      <div style={{ marginTop: 16 }}>
        {/* Step name + percent row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 8,
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 12,
              letterSpacing: "0.1em",
              color: "var(--fg-1)",
              textTransform: "uppercase",
            }}
          >
            {stepName}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 13,
              color: "var(--gold-hi)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {percent.toFixed(0).padStart(2, "0")}%
          </span>
        </div>

        {/* Progress rail */}
        <div
          style={{
            height: 3,
            borderRadius: 2,
            background: "var(--rail-bg)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            className="ribbon"
            style={{
              height: "100%",
              width: `${percent}%`,
              transition: "width .3s var(--ease)",
            }}
          />
        </div>

        {/* Description */}
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--fg-2)",
            lineHeight: 1.5,
          }}
        >
          {stepDescription}
        </div>
      </div>
    </div>
  );
}
