import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Cog, Crown, Check } from "lucide-react";
import { KpiStrip } from "@/components/profile/KpiStrip";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, plan, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = profile?.full_name ?? "reelio member";
  const initial = fullName.charAt(0).toUpperCase();
  const year = profile?.created_at
    ? new Date(profile.created_at).getFullYear()
    : 2024;
  const planLabel = profile?.plan === "free" ? "Free" : "Atelier";

  const planFeatures = [
    "Unlimited 4K vertical exports",
    "All 14 Atelier templates",
    "Custom logo + lower-third branding",
    "Priority render queue",
    "Multi-agent seats (up to 3)",
  ];

  const connectedAccounts = [
    { n: "Instagram", h: "@daniela.reyes", ok: true },
    { n: "TikTok", h: "@reyesandco", ok: true },
    { n: "YouTube", h: "Not connected", ok: false },
    { n: "MLS Sync", h: "CRMLS · 24 listings", ok: true },
  ];

  return (
    <div
      className="mx-auto flex flex-col"
      style={{ maxWidth: 1280, gap: 22, color: "var(--fg-0)" }}
    >
      {/* Header card */}
      <div
        className="card"
        style={{
          padding: 36,
          display: "flex",
          gap: 22,
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: 999,
            background:
              "linear-gradient(135deg, oklch(0.86 0.14 82), oklch(0.55 0.10 72))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: 36,
            color: "var(--on-gold)",
            letterSpacing: "-0.02em",
            boxShadow: "0 8px 24px -6px oklch(0.66 0.12 75 / 0.5)",
            flexShrink: 0,
          }}
        >
          {initial}
        </div>

        {/* Text block */}
        <div style={{ flex: 1 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>
            Atelier member · since {year}
          </div>
          <h1
            className="serif"
            style={{ fontSize: 32, margin: 0, letterSpacing: "-0.02em" }}
          >
            {fullName}
          </h1>
          <div style={{ color: "var(--fg-2)", fontSize: 13, marginTop: 4 }}>
            Reyes &amp; Co. · Beverly Hills
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 36,
              padding: "0 14px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "transparent",
              color: "var(--fg-1)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Cog size={14} /> Settings
          </button>
          <button
            type="button"
            className="btn-generate"
            style={{ height: 36 }}
          >
            <Crown size={14} /> Manage plan
          </button>
        </div>
      </div>

      {/* KPI Strip (client component) */}
      <KpiStrip />

      {/* Lower 2-col grid */}
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "1.1fr 1fr",
        }}
        className="profile-lower-grid"
      >
        <style>{`
          @media (max-width: 768px) {
            .profile-lower-grid {
              grid-template-columns: 1fr !important;
            }
          }
          @media (max-width: 640px) {
            .profile-header-card {
              flex-direction: column !important;
              text-align: center !important;
              padding: 22px !important;
            }
          }
        `}</style>

        {/* Plan card */}
        <div className="card" style={{ padding: 22 }}>
          <div className="kicker" style={{ marginBottom: 14 }}>
            Plan · {planLabel}
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              className="serif"
              style={{ fontSize: 44, letterSpacing: "-0.03em" }}
            >
              $48
            </span>
            <span style={{ color: "var(--fg-3)", fontSize: 13 }}>
              / month · billed annually
            </span>
          </div>

          {/* Credits box */}
          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 8,
              background: "oklch(0.66 0.12 75 / 0.06)",
              border: "1px solid oklch(0.66 0.12 75 / 0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--fg-2)" }}>Credits used</span>
              <span
                className="mono"
                style={{ color: "var(--gold-hi)" }}
              >
                53 / 100
              </span>
            </div>
            <div
              style={{
                height: 4,
                background: "var(--rail-bg)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: "53%",
                  height: "100%",
                  background:
                    "linear-gradient(90deg, var(--gold-lo), var(--gold-hi))",
                }}
              />
            </div>
            <div
              className="mono"
              style={{
                fontSize: 11.5,
                letterSpacing: "0.06em",
                color: "var(--fg-3)",
                marginTop: 8,
              }}
            >
              RESETS MAY 1 · 47 LEFT
            </div>
          </div>

          <div className="hr" style={{ margin: "18px 0" }} />

          <div className="kicker" style={{ marginBottom: 10 }}>
            Plan includes
          </div>

          {planFeatures.map((feature, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 0",
                fontSize: 13,
                color: "var(--fg-1)",
              }}
            >
              <Check size={13} /> {feature}
            </div>
          ))}
        </div>

        {/* Brand card */}
        <div className="card" style={{ padding: 22 }}>
          <div className="kicker" style={{ marginBottom: 14 }}>
            Brand
          </div>

          {/* Watermark logo field */}
          <div style={{ marginBottom: 12 }}>
            <div
              className="kicker"
              style={{ marginBottom: 6, fontSize: 12 }}
            >
              Watermark logo
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
                background: "var(--bg-2)",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 6,
                  background: "var(--bg-0)",
                  border: "1px solid var(--line-soft)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span className="serif" style={{ fontSize: 18 }}>
                  R
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>reyes_co_mark.svg</div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    color: "var(--fg-3)",
                    letterSpacing: "0.06em",
                  }}
                >
                  UPLOADED · 12 KB
                </div>
              </div>
              <button
                type="button"
                disabled
                style={{
                  height: 26,
                  padding: "0 10px",
                  fontSize: 12,
                  background: "transparent",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 6,
                  color: "var(--fg-1)",
                  cursor: "not-allowed",
                  opacity: 0.6,
                }}
              >
                Replace
              </button>
            </div>
          </div>

          {/* Lower-third name field */}
          <div style={{ marginBottom: 12 }}>
            <div
              className="kicker"
              style={{ marginBottom: 6, fontSize: 12 }}
            >
              Lower-third name
            </div>
            <input
              defaultValue={fullName}
              style={{
                width: "100%",
                height: 34,
                padding: "0 12px",
                background: "var(--bg-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
                outline: "none",
                color: "var(--fg-0)",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Tagline field */}
          <div style={{ marginBottom: 12 }}>
            <div
              className="kicker"
              style={{ marginBottom: 6, fontSize: 12 }}
            >
              Tagline
            </div>
            <input
              defaultValue="Curating homes for those who notice."
              style={{
                width: "100%",
                height: 34,
                padding: "0 12px",
                background: "var(--bg-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
                outline: "none",
                color: "var(--fg-0)",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div className="hr" style={{ margin: "12px 0 16px" }} />

          <div className="kicker" style={{ marginBottom: 10 }}>
            Connected
          </div>

          {connectedAccounts.map((c, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderTop: i ? "1px solid var(--line-soft)" : "none",
              }}
            >
              <div>
                <div style={{ fontSize: 13 }}>{c.n}</div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    color: "var(--fg-3)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {c.h}
                </div>
              </div>
              <span
                className="mono"
                style={{
                  fontSize: 12,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: c.ok ? "var(--positive)" : "var(--fg-3)",
                }}
              >
                {c.ok ? "● linked" : "○ link"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
