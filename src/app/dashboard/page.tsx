"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Building2, LayoutGrid, Plus } from "lucide-react";
import { useProperties } from "@/hooks/use-properties";
import { PropertyCard } from "@/components/properties/property-card";
import { CreatePropertyModal } from "@/components/properties/CreatePropertyModal";
import type { Status } from "@/components/properties/StatusPill";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";

function deriveStatus(seed: string, hasAssets: boolean): Status {
  if (!hasAssets) return "draft";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 17 + seed.charCodeAt(i)) | 0;
  const n = Math.abs(h) % 6;
  if (n < 3) return "published";
  if (n < 5) return "rendering";
  return "draft";
}

function relativeTime(iso: string | undefined, locale: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const m = Math.floor(ms / 60_000);
  if (m < 1) return rtf.format(0, "minute");
  if (m < 60) return rtf.format(-m, "minute");
  const h = Math.floor(m / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const d = Math.floor(h / 24);
  if (d < 7) return rtf.format(-d, "day");
  const w = Math.floor(d / 7);
  if (w < 4) return rtf.format(-w, "week");
  const mo = Math.floor(d / 30);
  return rtf.format(-mo, "month");
}

const DURATIONS = ["0:30", "0:45", "0:60"] as const;

type TimeOfDay = "night" | "morning" | "afternoon" | "evening";

const TIME_OF_DAY = (h: number): TimeOfDay =>
  h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";

function firstName(fullName: string | null | undefined, fallback: string): string {
  if (!fullName) return fallback;
  const trimmed = fullName.trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\s+/)[0];
}

export default function DashboardPage() {
  const { data: rows } = useProperties();
  const [modalOpen, setModalOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const { t, locale, dir } = useI18n();

  // Fetch the authed profile's full_name for the greeting; fall back to "there".
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setUserName((data?.full_name as string | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const now = new Date();
  const dateLabel = `${t.dashboard.weekdays[now.getDay()]}, ${now.getDate()} ${t.dashboard.months[now.getMonth()]}`;
  const greeting = `${t.dashboard.greeting[TIME_OF_DAY(now.getHours())]}, ${firstName(userName, t.dashboard.greeting.fallbackName)}.`;

  const recent = useMemo(
    () =>
      (rows ?? []).slice(0, 3).map((row) => {
        const r = row as {
          id: string;
          name: string;
          property_address?: string;
          created_at?: string;
          updated_at?: string;
          assetCount?: number;
          thumbnailUrl?: string | null;
        };
        const photoCount = r.assetCount ?? 0;
        const status = deriveStatus(r.id, photoCount > 0);
        let h = 0;
        for (let i = 0; i < r.id.length; i++)
          h = (h * 13 + r.id.charCodeAt(i)) | 0;
        const dur = DURATIONS[Math.abs(h) % DURATIONS.length];
        return {
          id: r.id,
          address: r.property_address ?? r.name,
          status,
          duration: dur,
          updated: relativeTime(r.updated_at ?? r.created_at, locale),
          thumbnailUrl: r.thumbnailUrl ?? undefined,
          views:
            status === "published"
              ? `${(((Math.abs(h) % 90) + 5) / 10).toFixed(1)}k`
              : "—",
        };
      }),
    [locale, rows],
  );

  return (
    <>
      <div
        className="mx-auto flex flex-col"
        style={{ maxWidth: 1280, gap: 22, color: "var(--fg-0)" }}
      >
        {/* Minimal hero — date kicker + serif greeting + actions */}
        <section
          className="flex flex-wrap items-end justify-between gap-4"
          style={{ padding: "8px 0" }}
        >
          <div>
            <div className="kicker" style={{ marginBottom: 10 }}>
              {dateLabel}
            </div>
            <h1
              className="serif"
              style={{
                fontSize: 36,
                lineHeight: 1.05,
                margin: 0,
                letterSpacing: "-0.02em",
                fontWeight: 400,
              }}
            >
              {greeting}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/properties"
              className="inline-flex items-center gap-2"
              style={{
                height: 36,
                padding: "0 14px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                color: "var(--fg-1)",
                fontSize: 13,
                fontWeight: 500,
                background: "transparent",
                transition: "all .15s var(--ease)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-2)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <LayoutGrid size={13} /> {t.shell.routes.properties}
            </Link>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="btn-generate"
            >
              {t.shell.newReel}
            </button>
          </div>
        </section>

        {/* Recent reels */}
        <section>
          <div
            className="flex items-baseline justify-between"
            style={{ marginBottom: 14 }}
          >
            <h2
              className="serif"
              style={{
                fontSize: 24,
                margin: 0,
                letterSpacing: "-0.02em",
                fontWeight: 400,
              }}
            >
              {t.dashboard.recentReels}
            </h2>
            <Link
              href="/dashboard/properties"
              className="inline-flex items-center gap-1"
              style={{
                fontSize: 12,
                color: "var(--fg-2)",
              }}
            >
              {t.dashboard.viewAll}{" "}
              <ArrowRight
                size={12}
                style={{ transform: dir === "rtl" ? "scaleX(-1)" : undefined }}
              />
            </Link>
          </div>

          {recent.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recent.map((property, index) => (
                <motion.div
                  key={property.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <PropertyCard {...property} />
                </motion.div>
              ))}
            </div>
          ) : (
            <div
              className="card flex flex-col items-center justify-center gap-3 h-48"
              style={{ borderStyle: "dashed" }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  background: "var(--gold-tint)",
                  border: "1px solid var(--gold-tint-2)",
                }}
              >
                <Building2 size={18} style={{ color: "var(--gold-hi)" }} />
              </div>
              <p
                className="serif"
                style={{
                  fontSize: 20,
                  letterSpacing: "-0.015em",
                  color: "var(--fg-0)",
                }}
              >
                {t.properties.noReels}
              </p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="btn-generate"
                style={{ height: 32, fontSize: 12.5, padding: "0 14px" }}
              >
                <Plus size={12} /> {t.dashboard.composeFirst}
              </button>
            </div>
          )}
        </section>
      </div>

      <CreatePropertyModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
