"use client";

import { useState } from "react";
import { useProperties } from "@/hooks/use-properties";
import { useI18n } from "@/lib/i18n/client";

type KpiCell = {
  k: string;
  v: string;
  d: string;
  pos?: boolean;
};

export function KpiStrip() {
  const { data: rows } = useProperties();
  const { t } = useI18n();
  const [now] = useState(() => Date.now());

  // Count projects that have at least one asset
  const publishedCount = (rows ?? []).filter((row) => {
    const r = row as { assets?: { count: number }[] };
    return Array.isArray(r.assets) && (r.assets[0]?.count ?? 0) > 0;
  }).length;

  // Count projects created within the last 7 days that have assets
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentCount = (rows ?? []).filter((row) => {
    const r = row as { created_at?: string; assets?: { count: number }[] };
    const hasAssets = Array.isArray(r.assets) && (r.assets[0]?.count ?? 0) > 0;
    const isRecent = r.created_at
      ? new Date(r.created_at).getTime() > sevenDaysAgo
      : false;
    return hasAssets && isRecent;
  }).length;

  const kpis: KpiCell[] = [
    {
      k: t.profile.kpi.reelsPublished,
      v: publishedCount > 0 ? String(publishedCount) : "0",
      d: recentCount > 0 ? `+${recentCount} ${t.profile.kpi.thisWeek}` : `0 ${t.profile.kpi.thisWeek}`,
      pos: recentCount > 0,
    },
    {
      k: t.profile.kpi.cumulativeViews,
      v: "128.4k",
      d: t.profile.kpi.prev30,
      pos: true,
    },
    {
      k: t.profile.kpi.avgCompletion,
      v: "74%",
      d: t.profile.kpi.industryAvg,
      pos: true,
    },
    {
      k: t.profile.kpi.creditsRemaining,
      v: "47",
      d: t.profile.kpi.resetsMay,
    },
  ];

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 1,
        background: "var(--line-soft)",
        border: "1px solid var(--line-soft)",
        borderRadius: 12,
        overflow: "hidden",
      }}
      className="kpi-strip"
    >
      <style>{`
        @media (max-width: 640px) {
          .kpi-strip {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
      {kpis.map((s, i) => (
        <div
          key={i}
          style={{
            background: "var(--bg-1)",
            padding: "14px 16px",
          }}
        >
          <div className="kicker" style={{ marginBottom: 8 }}>
            {s.k}
          </div>
          <div
            className="serif"
            style={{ fontSize: 24, lineHeight: 1, letterSpacing: "-0.02em" }}
          >
            {s.v}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: s.pos ? "var(--positive)" : "var(--fg-3)",
              marginTop: 6,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.02em",
            }}
          >
            {s.d}
          </div>
        </div>
      ))}
    </section>
  );
}
