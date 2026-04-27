"use client";

import { useState, useEffect } from "react";
import { Sparkles, Copy, Share2, Check } from "lucide-react";
import type { PropertyData } from "../property-detail";

function generateSmartCopy(data: PropertyData): string {
  const parts: string[] = [];

  const address = [
    data.street,
    data.streetNumber,
    data.neighborhood,
    data.city,
  ]
    .filter(Boolean)
    .join(" ");

  if (address) {
    parts.push(
      `🏠 ${data.propertyType || "Property"} for sale${address ? ` at ${address}` : ""}`,
    );
  } else {
    parts.push(`🏠 Stunning ${data.propertyType || "property"} for sale`);
  }

  parts.push("");

  const details: string[] = [];
  if (data.rooms) details.push(`🛏️ ${data.rooms} rooms`);
  if (data.size) details.push(`📐 ${data.size} m²`);
  if (data.floor && data.totalFloors) {
    details.push(`🏢 Floor ${data.floor} of ${data.totalFloors}`);
  } else if (data.floor) {
    details.push(`🏢 Floor ${data.floor}`);
  }
  if (data.price) details.push(`💰 ${data.price}`);

  if (details.length > 0) {
    parts.push(...details);
    parts.push("");
  }

  if (data.description) {
    parts.push("✨ About:");
    parts.push(data.description);
    parts.push("");
  }

  if (data.features.length > 0) {
    parts.push("🌟 What you'll find here:");
    data.features.forEach((f) => parts.push(`✅ ${f}`));
    parts.push("");
  }

  const ownerName = [data.ownerFirstName, data.ownerLastName]
    .filter(Boolean)
    .join(" ");
  if (ownerName || data.ownerPhone) {
    parts.push("📞 Contact:");
    if (ownerName) parts.push(`👤 ${ownerName}`);
    if (data.ownerPhone) parts.push(`📱 ${data.ownerPhone}`);
    parts.push("");
  }

  parts.push("#realestate #reelio");
  if (data.city) parts.push(`#${data.city.replace(/\s/g, "")}`);
  if (data.propertyType) parts.push(`#${data.propertyType.replace(/\s/g, "")}`);

  return parts.join("\n");
}

interface CopyTabProps {
  data: PropertyData;
  onChange: (patch: Partial<PropertyData>) => void;
}

export function CopyTab({ data }: CopyTabProps) {
  const [copyText, setCopyText] = useState(() => generateSmartCopy(data));
  const [copied, setCopied] = useState(false);

  const regenerate = () => {
    setCopyText(generateSmartCopy(data));
  };

  // Auto-generate once on mount
  useEffect(() => {
    setCopyText(generateSmartCopy(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the textarea
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            Marketing copy
          </div>
          <h2
            className="serif"
            style={{
              fontSize: 28,
              margin: 0,
              letterSpacing: "-0.02em",
              fontWeight: 400,
            }}
          >
            Listing{" "}
            <span style={{ fontStyle: "italic" }} className="gold-text">
              caption
            </span>
          </h2>
        </div>
        <button
          type="button"
          onClick={regenerate}
          className="btn-generate"
          style={{ height: 36 }}
        >
          <Sparkles size={13} /> Regenerate
        </button>
      </div>

      {/* Copy card */}
      <div
        style={{
          padding: 18,
          borderRadius: 12,
          background: "oklch(0.66 0.12 75 / 0.06)",
          border: "1px solid oklch(0.66 0.12 75 / 0.20)",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <span
            className="kicker"
            style={{ color: "var(--gold-hi)" }}
          >
            ready to share
          </span>
          <div
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            {copied && (
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--positive)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Check size={11} /> copied
              </span>
            )}
            <button
              type="button"
              onClick={handleCopy}
              title="Copy to clipboard"
              style={{
                background: "transparent",
                border: 0,
                color: "var(--fg-2)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 4,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color .15s var(--ease)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--gold-hi)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--fg-2)")
              }
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
        <textarea
          value={copyText}
          onChange={(e) => setCopyText(e.target.value)}
          rows={18}
          style={{
            width: "100%",
            background: "transparent",
            color: "var(--fg-0)",
            fontSize: 13,
            lineHeight: 1.55,
            border: 0,
            outline: 0,
            resize: "vertical",
            fontFamily: "inherit",
          }}
          placeholder="Click 'Regenerate' to compose marketing copy…"
        />
      </div>

      {/* Share button */}
      <button
        type="button"
        onClick={() => console.log("TODO: share copy text", copyText)}
        className="btn-generate"
        style={{
          width: "100%",
          height: 44,
          justifyContent: "center",
          fontSize: 14,
        }}
      >
        <Share2 size={15} /> Share caption
      </button>
    </div>
  );
}
