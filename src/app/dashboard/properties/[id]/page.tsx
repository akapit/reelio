"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PropertyDetail } from "@/components/properties/property-detail";

interface Property {
  id: string;
  name: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  property_address?: string | null;
}

export default function PropertyDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!id || hasFetched.current) return;
    hasFetched.current = true;

    const supabase = createClient();

    async function fetchProperty() {
      setIsLoading(true);
      setIsError(false);
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, created_at, property_address")
          .eq("id", id)
          .single();
        if (error) throw error;
        setProperty(data as Property);
      } catch (err) {
        console.error("[property-detail] fetch failed", err);
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProperty();
  }, [id]);

  if (isLoading) {
    return (
      <div
        className="property-loading mx-auto flex flex-col"
        style={{ maxWidth: 1024, gap: 22, color: "var(--fg-0)" }}
      >
        <style>{`
          @keyframes property-loading-shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          .pl-bar {
            background: var(--bg-2);
            border-radius: 6px;
            position: relative;
            overflow: hidden;
          }
          .pl-bar::after,
          .pl-tile::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.44), transparent);
            animation: property-loading-shimmer 1.8s var(--ease) infinite;
          }
          .pl-tile {
            aspect-ratio: 1 / 1;
            border-radius: 10px;
            border: 1px solid var(--line-soft);
            position: relative;
            overflow: hidden;
          }
          .pl-grid {
            --photos-grid-gap: 16px;
            --photos-grid-cap: 5;
            display: grid;
            grid-template-columns: repeat(
              auto-fill,
              minmax(
                max(120px, calc((100% - (var(--photos-grid-cap) - 1) * var(--photos-grid-gap)) / var(--photos-grid-cap))),
                1fr
              )
            );
            gap: var(--photos-grid-gap);
          }
          .pl-pill {
            height: 18px;
            width: 64px;
            margin-inline: auto;
            margin-top: 6px;
            border-radius: 999px;
            background: var(--bg-2);
            border: 1px solid var(--line-soft);
          }
          .pl-index {
            position: absolute;
            inset-block-start: 8px;
            inset-inline-start: 8px;
            width: 24px;
            height: 22px;
            border-radius: 6px;
            background: rgb(23 24 31 / 0.78);
            z-index: 2;
          }
          .pl-tab-active::after {
            content: "";
            position: absolute;
            inset-inline: 0;
            inset-block-end: 0;
            height: 2px;
            background: var(--gold);
          }
          @media (max-width: 640px) {
            .pl-grid {
              --photos-grid-gap: 12px;
              --photos-grid-cap: 2;
            }
            .pl-action-rail > :not(:first-child) {
              display: none;
            }
          }
        `}</style>

        <section style={{ paddingBlock: 4 }}>
          <div className="pl-bar" style={{ height: 38, width: "60%" }} />
          <div className="pl-bar" style={{ height: 14, width: "75%", marginTop: 12, maxWidth: 460 }} />
          <div className="pl-bar" style={{ height: 13, width: "45%", marginTop: 6, maxWidth: 360 }} />
        </section>

        <section className="card" style={{ padding: 0, overflow: "hidden", minWidth: 0 }}>
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

          <div style={{ padding: "0 22px 24px" }}>
            <div className="pl-grid">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                  <div className="pl-tile prop-img" data-tone="warm" aria-hidden="true">
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

  if (isError || !property) {
    return (
      <div
        className="mx-auto"
        style={{ maxWidth: 640, padding: "80px 0", color: "var(--fg-0)" }}
      >
        <div
          className="card"
          style={{
            padding: 40,
            textAlign: "center",
            borderColor: "oklch(0.65 0.20 25 / 0.4)",
          }}
        >
          <div className="kicker" style={{ marginBottom: 8 }}>
            404 · not found
          </div>
          <h1
            className="serif"
            style={{
              fontSize: 32,
              margin: 0,
              letterSpacing: "-0.02em",
              fontWeight: 400,
            }}
          >
            Listing not found
          </h1>
          <p
            style={{
              color: "var(--fg-2)",
              fontSize: 13,
              marginTop: 10,
            }}
          >
            It may have been deleted, or you may not have access to view it.
          </p>
          <Link
            href="/dashboard/properties"
            className="inline-flex items-center gap-2"
            style={{
              marginTop: 22,
              height: 36,
              padding: "0 14px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              color: "var(--fg-1)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={14} /> Back to properties
          </Link>
        </div>
      </div>
    );
  }

  return <PropertyDetail projectId={property.id} property={property} />;
}
