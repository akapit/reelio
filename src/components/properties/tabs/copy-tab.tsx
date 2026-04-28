"use client";

import { useState, useEffect } from "react";
import { RefreshCcw, Copy, Share2, Check } from "lucide-react";
import type { PropertyData } from "../property-detail";
import { useI18n } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";

function generateSmartCopy(data: PropertyData, t: Dictionary): string {
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
      `🏠 ${data.propertyType || t.copy.fallbackProperty} ${t.copy.forSale}${address ? ` ${address}` : ""}`,
    );
  } else {
    parts.push(`🏠 ${t.copy.stunning} ${data.propertyType || t.copy.fallbackProperty} ${t.copy.forSale}`);
  }

  parts.push("");

  const details: string[] = [];
  if (data.rooms) details.push(`🛏️ ${data.rooms} ${t.copy.rooms}`);
  if (data.size) details.push(`📐 ${data.size} m²`);
  if (data.floor && data.totalFloors) {
    details.push(`🏢 ${t.copy.floor} ${data.floor} / ${data.totalFloors}`);
  } else if (data.floor) {
    details.push(`🏢 ${t.copy.floor} ${data.floor}`);
  }
  if (data.price) details.push(`💰 ${data.price}`);

  if (details.length > 0) {
    parts.push(...details);
    parts.push("");
  }

  if (data.description) {
    parts.push(`✨ ${t.copy.about}`);
    parts.push(data.description);
    parts.push("");
  }

  if (data.features.length > 0) {
    parts.push(`🌟 ${t.copy.whatYouFind}`);
    data.features.forEach((f) => parts.push(`✅ ${f}`));
    parts.push("");
  }

  const ownerName = [data.ownerFirstName, data.ownerLastName]
    .filter(Boolean)
    .join(" ");
  if (ownerName || data.ownerPhone) {
    parts.push(`📞 ${t.copy.contact}`);
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
  const { t } = useI18n();
  const [copyText, setCopyText] = useState(() => generateSmartCopy(data, t));
  const [copied, setCopied] = useState(false);

  const regenerate = () => {
    setCopyText(generateSmartCopy(data, t));
  };

  // Auto-generate once on mount
  useEffect(() => {
    setCopyText(generateSmartCopy(data, t));
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
    <div className="copy-tab" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        .copy-tab-card { padding: 18px; }
        .copy-tab-textarea { font-size: 13px; }
        @media (max-width: 640px) {
          .copy-tab-card { padding: 12px; }
          .copy-tab-textarea { font-size: 12.5px; }
        }
      `}</style>
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
            {t.copy.marketingCopy}
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
            {t.copy.copyTitle}{" "}
            <span className="gold-text">
              {t.copy.caption}
            </span>
          </h2>
        </div>
        <button
          type="button"
          onClick={regenerate}
          className="btn-action"
          data-variant="ai"
        >
          <RefreshCcw size={13} strokeWidth={2.25} /> {t.copy.createNewCopy}
        </button>
      </div>

      {/* Copy card */}
      <div
        className="copy-tab-card"
        style={{
          borderRadius: 12,
          background: "var(--gold-tint)",
          border: "1px solid var(--gold-tint-2)",
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
            {t.copy.ready}
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
                <Check size={11} /> {t.copy.copied}
              </span>
            )}
            <button
              type="button"
              onClick={handleCopy}
              title={t.copy.copyToClipboard}
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
          rows={14}
          className="copy-tab-textarea"
          style={{
            width: "100%",
            background: "transparent",
            color: "var(--fg-0)",
            lineHeight: 1.55,
            border: 0,
            outline: 0,
            resize: "vertical",
            fontFamily: "inherit",
          }}
          placeholder={t.copy.placeholder}
        />
      </div>

      {/* Share button */}
      <button
        type="button"
        onClick={() => console.log("TODO: share copy text", copyText)}
        className="btn-cta"
        style={{ width: "100%" }}
      >
        <Share2 size={15} /> {t.copy.shareCaption}
      </button>
    </div>
  );
}
