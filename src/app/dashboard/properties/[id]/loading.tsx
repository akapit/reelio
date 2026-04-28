export default function PropertyDetailLoading() {
  return (
    <div
      className="property-loading mx-auto flex flex-col"
      style={{
        maxWidth: 1024,
        gap: 22,
        color: "var(--fg-0)",
      }}
    >
      <style>{`
        @keyframes property-loading-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes property-loading-pulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
        .pl-bar {
          background: var(--bg-2);
          border-radius: 6px;
          animation: property-loading-pulse 1.6s var(--ease) infinite;
          position: relative;
          overflow: hidden;
        }
        .pl-bar::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent,
            oklch(1 0 0 / 0.45) 50%,
            transparent
          );
          animation: property-loading-shimmer 1.8s var(--ease) infinite;
        }
        .pl-tile {
          aspect-ratio: 1 / 1;
          border-radius: 10px;
          border: 1px solid var(--line-soft);
          position: relative;
          overflow: hidden;
        }
        .pl-tile::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent,
            oklch(1 0 0 / 0.18) 45%,
            transparent
          );
          animation: property-loading-shimmer 2.4s var(--ease) infinite;
          pointer-events: none;
        }
        .pl-pill {
          height: 18px;
          width: 64px;
          margin-inline: auto;
          margin-top: 6px;
          border-radius: 999px;
          background: var(--bg-2);
          border: 1px solid var(--line-soft);
          animation: property-loading-pulse 1.6s var(--ease) infinite;
        }
        .pl-index {
          position: absolute;
          inset-block-start: 8px;
          inset-inline-start: 8px;
          width: 24px;
          height: 22px;
          border-radius: 6px;
          background: oklch(0.18 0.008 72 / 0.78);
          z-index: 2;
        }
        .pl-grid {
          --photos-grid-gap: 16px;
          --photos-grid-cap: 5;
          --photos-grid-max: 1024px;
          display: grid;
          grid-template-columns: repeat(
            auto-fill,
            minmax(
              max(120px, calc((100% - (var(--photos-grid-cap) - 1) * var(--photos-grid-gap)) / var(--photos-grid-cap))),
              1fr
            )
          );
          gap: var(--photos-grid-gap);
          width: 100%;
          max-width: var(--photos-grid-max);
          margin-inline: auto;
        }
        @media (max-width: 640px) {
          .pl-grid {
            --photos-grid-gap: 12px;
            --photos-grid-cap: 2;
            grid-template-columns: repeat(
              auto-fill,
              minmax(
                max(140px, calc((100% - (var(--photos-grid-cap) - 1) * var(--photos-grid-gap)) / var(--photos-grid-cap))),
                1fr
              )
            );
          }
          .pl-action-rail > :not(:first-child) {
            display: none;
          }
        }
        .pl-tab-active::after {
          content: "";
          position: absolute;
          inset-inline: 0;
          inset-block-end: 0;
          height: 2px;
          background: var(--gold);
        }
      `}</style>

      {/* Header — title, tagline, address */}
      <section style={{ paddingBlock: 4 }}>
        <div className="pl-bar" style={{ height: 38, width: "60%" }} />
        <div
          className="pl-bar"
          style={{ height: 14, width: "75%", marginTop: 12, maxWidth: 460 }}
        />
        <div
          className="pl-bar"
          style={{ height: 12, width: "45%", marginTop: 6, maxWidth: 360 }}
        />
      </section>

      {/* Workspace card */}
      <section
        className="card"
        style={{ padding: 0, overflow: "hidden", minWidth: 0 }}
      >
        {/* Tab bar — current property detail tabs, photos active */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--line-soft)",
            background: "var(--bg-1)",
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={i === 1 ? "pl-tab-active" : ""}
              style={{
                flex: 1,
                position: "relative",
                height: 68,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "12px 8px 10px",
                background: i === 1 ? "var(--bg-2)" : "transparent",
              }}
            >
              <div className="pl-bar" style={{ width: 18, height: 18, borderRadius: 4 }} />
              <div className="pl-bar" style={{ width: 48, height: 13 }} />
            </div>
          ))}
        </div>

        {/* Photos tab content: upload CTA + toolbar */}
        <div style={{ padding: "20px 22px 12px" }}>
          <div
            className="pl-bar"
            style={{
              height: 44,
              width: "100%",
              borderRadius: 8,
              border: "1.5px solid var(--gold)",
              background: "transparent",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 16,
            }}
          >
            <div className="pl-bar" style={{ height: 16, width: 136 }} />
            <div className="pl-action-rail" style={{ display: "flex", gap: 8 }}>
              <div className="pl-bar" style={{ height: 36, width: 64, borderRadius: 8 }} />
              <div className="pl-bar" style={{ height: 36, width: 76, borderRadius: 8 }} />
              <div className="pl-bar" style={{ height: 36, width: 76, borderRadius: 8 }} />
              <div className="pl-bar" style={{ height: 36, width: 66, borderRadius: 8 }} />
            </div>
          </div>
        </div>

        {/* Photo grid skeleton */}
        <div style={{ padding: "0 22px 24px" }}>
          <div className="pl-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                style={{ display: "flex", flexDirection: "column" }}
              >
                <div
                  className="pl-tile prop-img"
                  data-tone="warm"
                  aria-hidden="true"
                >
                  <div className="pl-index" />
                </div>
                <div className="pl-pill" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
