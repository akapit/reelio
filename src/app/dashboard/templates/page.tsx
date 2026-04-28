"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTemplates } from "@/hooks/use-templates";
import { TemplateCard } from "@/components/templates/TemplateCard";
import { TEMPLATE_META, FALLBACK_META } from "@/components/templates/template-meta";
import { useI18n } from "@/lib/i18n/client";

export default function TemplatesPage() {
  const { data: templates, isLoading, isError } = useTemplates();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeId, setActiveId] = useState<string | null>(
    searchParams.get("selected"),
  );

  function handleSelect(id: string) {
    setActiveId(id);
    router.replace(`?selected=${id}`, { scroll: false });
  }

  const effectiveActiveId = activeId ?? templates?.[0]?.id ?? null;
  const activeTemplate = templates?.find((t) => t.id === effectiveActiveId);
  const activeMeta = effectiveActiveId
    ? (TEMPLATE_META[effectiveActiveId] ?? FALLBACK_META)
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
          Atelier · {isLoading ? "…" : (templates?.length ?? 0)} {t.templates.countLabel}
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
          {t.templates.headingPrefix}{" "}
          <span className="gold-text">
            {t.templates.headingAccent}
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
            {t.templates.error}
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
              selected={template.id === effectiveActiveId}
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
              if (effectiveActiveId) {
                router.push(`/dashboard/upload?template=${effectiveActiveId}`);
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
            {t.templates.useTemplate}
          </button>

          <span
            className="mono gold-text"
            style={{ fontSize: 12, letterSpacing: "0.08em" }}
          >
            {t.templates.selected}: {activeName}
          </span>
        </div>
      )}
    </div>
  );
}
