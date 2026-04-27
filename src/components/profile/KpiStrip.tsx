"use client";

import { useProperties } from "@/hooks/use-properties";

type KpiCell = {
  k: string;
  v: string;
  d: string;
  pos?: boolean;
};

export function KpiStrip() {
  const { data: rows } = useProperties();

  // Count projects that have at least one asset
  const publishedCount = (rows ?? []).filter((row) => {
    const r = row as { assets?: { count: number }[] };
    return Array.isArray(r.assets) && (r.assets[0]?.count ?? 0) > 0;
  }).length;

  // Count projects created within the last 7 days that have assets
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
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
      k: "reels published",
      v: publishedCount > 0 ? String(publishedCount) : "0",
      d: recentCount > 0 ? `+${recentCount} this week` : "0 this week",
      pos: recentCount > 0,
    },
    {
      k: "cumulative views",
      v: "128.4k",
      d: "+12.1% vs prev 30d",
      pos: true,
    },
    {
      k: "avg. completion",
      v: "74%",
      d: "industry avg. 31%",
      pos: true,
    },
    {
      k: "credits remaining",
      v: "47",
      d: "resets May 1",
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
