"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Building2, Plus, Sparkles, Search } from "lucide-react";
import { useProperties } from "@/hooks/use-properties";
import { PropertyCard } from "@/components/properties/property-card";
import { CreatePropertyModal } from "@/components/properties/CreatePropertyModal";
import { Button } from "@/components/ui/button";
import type { Status } from "@/components/properties/StatusPill";

type Filter = "all" | "live" | "rendering" | "draft";
const FILTERS: Filter[] = ["all", "live", "rendering", "draft"];

function deriveStatus(seed: string, hasAssets: boolean): Status {
  if (!hasAssets) return "draft";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 17 + seed.charCodeAt(i)) | 0;
  const n = Math.abs(h) % 6;
  if (n < 3) return "published";
  if (n < 5) return "rendering";
  return "draft";
}

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

const DURATIONS = ["0:30", "0:45", "0:60"] as const;

export default function PropertiesPage() {
  const { data: rows, isLoading, isError } = useProperties();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [modalOpen, setModalOpen] = useState(false);

  const properties = useMemo(
    () =>
      (rows ?? []).map((row) => {
        const r = row as {
          id: string;
          name: string;
          property_address?: string;
          created_at?: string;
          updated_at?: string;
          assets?: { count: number }[];
        };
        const photoCount = Array.isArray(r.assets)
          ? (r.assets[0]?.count ?? 0)
          : 0;
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
          updated: relativeTime(r.updated_at ?? r.created_at),
          views:
            status === "published"
              ? `${(((Math.abs(h) % 90) + 5) / 10).toFixed(1)}k`
              : "—",
        };
      }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return properties.filter((p) => {
      if (q && !p.address.toLowerCase().includes(q)) return false;
      if (filter === "all") return true;
      if (filter === "live") return p.status === "published";
      return p.status === filter;
    });
  }, [properties, searchQuery, filter]);

  return (
    <>
      <div className="mx-auto" style={{ maxWidth: 1280, color: "var(--fg-0)" }}>
        <section
          className="flex flex-wrap items-end justify-between gap-4"
          style={{ marginBottom: 22 }}
        >
          <div>
            <div className="kicker" style={{ marginBottom: 8 }}>
              Properties · {properties.length} reels
            </div>
            <h1
              className="serif"
              style={{
                fontSize: 44,
                margin: 0,
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
                fontWeight: 400,
              }}
            >
              Your{" "}
              <span style={{ fontStyle: "italic" }} className="gold-text">
                collection
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center gap-2"
              style={{
                height: 36,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--line-soft)",
                background: "var(--bg-1)",
                width: 220,
              }}
            >
              <Search size={14} style={{ color: "var(--fg-2)" }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reels, addresses…"
                className="w-full bg-transparent outline-none border-0"
                style={{ fontSize: 13, color: "var(--fg-1)" }}
              />
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="btn-generate"
            >
              <Plus size={14} /> New
            </button>
          </div>
        </section>

        <div
          className="flex items-center gap-3 flex-wrap"
          style={{ marginBottom: 22 }}
        >
          <div className="seg">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <span
            className="mono"
            style={{
              fontSize: 12,
              color: "var(--fg-3)",
              letterSpacing: "0.06em",
            }}
          >
            {filtered.length} of {properties.length}
          </span>
        </div>

        {isError && (
          <div
            className="card flex items-center justify-center h-32"
            style={{
              borderColor: "oklch(0.55 0.18 25 / 0.4)",
              background: "oklch(0.55 0.18 25 / 0.06)",
            }}
          >
            <p className="text-sm" style={{ color: "oklch(0.55 0.18 25)" }}>
              Failed to load reels. Refresh to try again.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="card overflow-hidden"
                style={{ padding: 0 }}
              >
                <div
                  style={{ aspectRatio: "5 / 4", background: "var(--bg-2)" }}
                  className="animate-pulse"
                />
                <div className="p-4 space-y-2">
                  <div
                    className="h-5 w-3/4 rounded animate-pulse"
                    style={{ background: "var(--bg-2)" }}
                  />
                  <div
                    className="h-4 w-1/2 rounded animate-pulse"
                    style={{ background: "var(--bg-2)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="card flex flex-col items-center justify-center gap-4 h-64"
            style={{ borderStyle: "dashed", borderColor: "var(--line)" }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: "var(--gold-tint)",
                border: "1px solid var(--gold-tint-2)",
              }}
            >
              <Building2 size={22} style={{ color: "var(--gold-hi)" }} />
            </div>
            <div className="text-center">
              <p
                className="serif"
                style={{
                  fontSize: 22,
                  letterSpacing: "-0.015em",
                  color: "var(--fg-0)",
                }}
              >
                {searchQuery ? "No reels match your search" : "No reels yet"}
              </p>
              {!searchQuery && (
                <p
                  className="kicker"
                  style={{ marginTop: 8, color: "var(--fg-3)" }}
                >
                  Compose your first reel to get started
                </p>
              )}
            </div>
            {!searchQuery && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setModalOpen(true)}
              >
                <Sparkles size={14} />
                New reel
              </Button>
            )}
          </motion.div>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((property, index) => (
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
        )}
      </div>

      <CreatePropertyModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
