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
        className="mx-auto flex flex-col"
        style={{ maxWidth: 1280, gap: 22 }}
      >
        {/* Header skeleton */}
        <div style={{ paddingBlock: 4 }}>
          <div
            className="h-3 w-32 rounded animate-pulse"
            style={{ background: "var(--bg-2)" }}
          />
          <div
            className="h-10 w-96 rounded animate-pulse"
            style={{ background: "var(--bg-2)", marginTop: 10 }}
          />
          <div
            className="h-3 w-64 rounded animate-pulse"
            style={{ background: "var(--bg-2)", marginTop: 12 }}
          />
        </div>

        {/* Two-card skeleton */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
            gap: 16,
          }}
        >
          <div className="card" style={{ padding: 18 }}>
            <div
              className="prop-img animate-pulse"
              data-tone="warm"
              style={{ aspectRatio: "5 / 4", borderRadius: 12 }}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
                marginTop: 18,
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="prop-img animate-pulse"
                  data-tone="warm"
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: 6,
                    border: "1px solid var(--line-soft)",
                  }}
                />
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 22 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-full rounded animate-pulse"
                style={{
                  background: "var(--bg-2)",
                  marginBottom: 10,
                }}
              />
            ))}
          </div>
        </div>
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
