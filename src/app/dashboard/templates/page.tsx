"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTemplates } from "@/hooks/use-templates";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { TEMPLATE_META, FALLBACK_META } from "@/components/templates/template-meta";

export default function TemplatesPage() {
  const { data: templates, isLoading, isError } = useTemplates();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeId, setActiveId] = useState<string | null>(
    searchParams.get("selected"),
  );

  // Once templates load, default to the first one if no selection yet
  useEffect(() => {
    if (!isLoading && templates && templates.length > 0 && activeId === null) {
      setActiveId(templates[0].id);
    }
  }, [isLoading, templates, activeId]);

  function handleSelect(id: string) {
    setActiveId(id);
    router.replace(`?selected=${id}`, { scroll: false });
  }

  const activeTemplate = templates?.find((t) => t.id === activeId);
  const activeMeta = activeId
    ? (TEMPLATE_META[activeId] ?? FALLBACK_META)
    : null;
  const activeName = activeTemplate?.name ?? activeMeta?.style ?? "—";

  return (
    <div
      className="mx-auto"
      style={{
        maxWidth: 1280,
        color: "var(--fg-0)",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      {/* Header */}
      <div>
        <div className="kicker" style={{ marginBottom: 8 }}>
          Atelier · {isLoading ? "…" : (templates?.length ?? 0)} templates
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
          A house style for{" "}
          <span style={{ fontStyle: "italic" }} className="gold-text">
            every listing
          </span>
        </h1>
      </div>

      {/* Error state */}
      {isError && (
        <div
          className="card flex items-center justify-center h-32"
          style={{
            borderColor: "oklch(0.55 0.18 25 / 0.4)",
            background: "oklch(0.55 0.18 25 / 0.06)",
          }}
        >
          <p className="text-sm" style={{ color: "oklch(0.55 0.18 25)" }}>
            Failed to load templates. Refresh to try again.
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card overflow-hidden" style={{ padding: 0 }}>
              <div
                style={{ aspectRatio: "5 / 4", background: "var(--bg-2)" }}
                className="animate-pulse"
              />
              <div className="p-4 space-y-2">
                <div
                  className="h-4 w-3/4 rounded animate-pulse"
                  style={{ background: "var(--bg-2)" }}
                />
                <div
                  className="h-3 w-1/2 rounded animate-pulse"
                  style={{ background: "var(--bg-2)" }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template grid */}
      {!isLoading && !isError && templates && templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              selected={template.id === activeId}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}

      {/* Footnote action row */}
      {!isLoading && !isError && (
        <div
          className="flex items-center gap-4"
          style={{ paddingTop: 4 }}
        >
          <button
            type="button"
            onClick={() => {
              if (activeId) {
                router.push(`/dashboard/upload?template=${activeId}`);
              }
            }}
            style={{
              height: 36,
              padding: "0 14px",
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: 8,
              color: "var(--fg-1)",
              fontSize: 13,
              cursor: "pointer",
              transition: "background .15s var(--ease)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--bg-2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
            }}
          >
            Use this template
          </button>

          <span
            className="mono gold-text"
            style={{ fontSize: 12, letterSpacing: "0.08em" }}
          >
            Selected: {activeName}
          </span>
        </div>
      )}
    </div>
  );
}
