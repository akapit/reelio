"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEngineRun } from "@/hooks/use-engine-run";
import { createClient } from "@/lib/supabase/client";
import { LivePreviewCard } from "@/components/generate/LivePreviewCard";
import { PipelineList } from "@/components/generate/PipelineList";

// ─── Design step definitions ──────────────────────────────────────────────────

interface DesignLabel {
  k: string;
  d: string;
  matches: (stepType: string) => boolean;
}

const STEP_LABELS: DesignLabel[] = [
  {
    k: "Analyzing composition",
    d: "Scanning your photos for subject, leading lines, and natural light.",
    matches: (t) => /vision|analy(z|s)e/i.test(t),
  },
  {
    k: "Selecting beats",
    d: "Matching visual rhythm to score and pacing.",
    matches: (t) => /(plan|timeline|select)/i.test(t),
  },
  {
    k: "Color grading",
    d: "Applying Editorial Warm LUT — magic-hour bias.",
    matches: (t) => /(prompt|color|grade)/i.test(t),
  },
  {
    k: "Rendering motion",
    d: "Computing parallax, slow push-ins, and chapter transitions.",
    matches: (t) => /(scene_generate|render|motion)/i.test(t),
  },
  {
    k: "Mastering audio",
    d: "Mixing piano motif and ambience; ducking under VO.",
    matches: (t) => /(audio|merge|master)/i.test(t),
  },
];

const TOTAL_STEPS = STEP_LABELS.length;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeActiveIdx(
  status: string,
  steps: { step_type: string; status: string }[],
): number {
  if (status === "done") return TOTAL_STEPS;

  // Count distinct design-label indices where at least one engine step is done
  let completedCount = 0;
  let activeDesignIdx = -1;

  for (let i = 0; i < STEP_LABELS.length; i++) {
    const label = STEP_LABELS[i];
    const matchingSteps = steps.filter((s) => label.matches(s.step_type));
    const hasDone = matchingSteps.some((s) => s.status === "done");
    const hasRunning = matchingSteps.some((s) => s.status === "running");

    if (hasDone) {
      completedCount = i + 1;
    }
    if (hasRunning && activeDesignIdx === -1) {
      activeDesignIdx = i;
    }
  }

  // If we found a running step that is beyond what's completed, that's active
  if (activeDesignIdx !== -1 && activeDesignIdx >= completedCount) {
    return activeDesignIdx;
  }

  return completedCount;
}

function computePercent(
  status: string,
  steps: { step_type: string; status: string }[],
  activeIdx: number,
): number {
  if (status === "done") return 100;
  if (steps.length === 0 && status !== "running") return 0;

  const completedDesignSteps = STEP_LABELS.filter((label) =>
    steps.some((s) => label.matches(s.step_type) && s.status === "done"),
  ).length;

  const hasActiveRunning = steps.some(
    (s) =>
      s.status === "running" &&
      activeIdx < STEP_LABELS.length &&
      STEP_LABELS[activeIdx].matches(s.step_type),
  );

  return Math.min(
    99,
    ((completedDesignSteps + (hasActiveRunning ? 0.5 : 0)) / TOTAL_STEPS) *
      100,
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const assetId = searchParams.get("assetId");
  const projectId = searchParams.get("projectId");

  const [projectTitle, setProjectTitle] = useState("Marina Sky");
  const [projectAddress, setProjectAddress] = useState(
    "88 harbor view · miami beach",
  );

  // Fetch project name and address
  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("name, property_address")
        .eq("id", projectId)
        .single();
      if (cancelled || !data) return;
      const row = data as { name?: string; property_address?: string };
      if (row.name) setProjectTitle(row.name);
      if (row.property_address) setProjectAddress(row.property_address);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const { data, isLoading } = useEngineRun(assetId);

  const run = data?.run ?? null;
  const steps = data?.steps ?? [];
  const status = run?.status ?? "pending";

  const activeIdx = computeActiveIdx(status, steps);
  const percent = computePercent(status, steps, activeIdx);

  // Clamp for display — when done, show the last label
  const displayIdx = Math.min(activeIdx, TOTAL_STEPS - 1);
  const currentLabel = STEP_LABELS[displayIdx];

  // Redirect on completion after a short settle
  useEffect(() => {
    if (status !== "done" || !projectId) return;
    const t = setTimeout(() => {
      router.push(`/dashboard/properties/${projectId}`);
    }, 1000);
    return () => clearTimeout(t);
  }, [status, projectId, router]);

  // ── No assetId guard ──────────────────────────────────────────────────────
  if (!assetId) {
    return (
      <div
        className="mx-auto flex flex-col"
        style={{ maxWidth: 1280, gap: 22, color: "var(--fg-0)" }}
      >
        <div
          className="card"
          style={{
            padding: 32,
            textAlign: "center",
            border: "1px solid oklch(0.55 0.18 25 / 0.4)",
          }}
        >
          <p
            className="serif"
            style={{ fontSize: 22, marginBottom: 12, letterSpacing: "-0.02em" }}
          >
            No asset to track
          </p>
          <p style={{ fontSize: 14, color: "var(--fg-2)", marginBottom: 20 }}>
            This page requires an <code>assetId</code> query parameter.
          </p>
          <Link
            href="/dashboard/upload"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 36,
              padding: "0 16px",
              borderRadius: 8,
              background: "var(--gold-tint)",
              border: "1px solid var(--gold-tint-2)",
              color: "var(--gold-hi)",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Back to upload
          </Link>
        </div>
      </div>
    );
  }

  // ── Failed state overlay ──────────────────────────────────────────────────
  const errorMessage =
    status === "failed" && run?.error
      ? String(
          (run.error as Record<string, unknown>).message ??
            JSON.stringify(run.error),
        )
      : null;

  return (
    <div
      className="mx-auto flex flex-col"
      style={{ maxWidth: 1280, gap: 22, color: "var(--fg-0)" }}
    >
      {/* Header */}
      <div>
        <div className="kicker" style={{ marginBottom: 8 }}>
          <span style={{ color: "var(--gold-hi)" }}>02</span> · generating
        </div>
        <h1
          className="serif"
          style={{
            fontSize: "clamp(30px, 4vw, 40px)",
            margin: 0,
            letterSpacing: "-0.025em",
            fontWeight: 400,
          }}
        >
          Composing your{" "}
          <span className="gold-text">
            reel
          </span>
        </h1>
      </div>

      {/* Failed error card */}
      {status === "failed" && (
        <div
          className="card"
          style={{
            padding: "20px 24px",
            border: "1px solid oklch(0.55 0.18 25 / 0.5)",
            background: "oklch(0.98 0.01 25 / 0.4)",
          }}
        >
          <p
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "oklch(0.45 0.18 25)",
              marginBottom: errorMessage ? 8 : 0,
            }}
          >
            Generation failed
          </p>
          {errorMessage && (
            <p
              className="mono"
              style={{ fontSize: 12, color: "var(--fg-2)", marginBottom: 16 }}
            >
              {errorMessage}
            </p>
          )}
          <Link
            href="/dashboard/upload"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 32,
              padding: "0 14px",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--fg-1)",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Try again
          </Link>
        </div>
      )}

      {/* Main 2-col grid */}
      {!isLoading || run !== null ? (
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "1.1fr 1fr",
          }}
          className="generate-grid"
        >
          <LivePreviewCard
            projectTitle={projectTitle}
            projectAddress={projectAddress}
            percent={percent}
            stepName={currentLabel.k}
            stepDescription={
              status === "pending" && steps.length === 0 && run === null
                ? "Starting your reel…"
                : currentLabel.d
            }
          />
          <PipelineList
            steps={STEP_LABELS.map(({ k, d }) => ({ k, d }))}
            activeIdx={activeIdx}
          />
        </div>
      ) : (
        /* Loading skeleton */
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "1.1fr 1fr",
          }}
          className="generate-grid"
        >
          <LivePreviewCard
            projectTitle={projectTitle}
            projectAddress={projectAddress}
            percent={0}
            stepName={STEP_LABELS[0].k}
            stepDescription="Starting your reel…"
          />
          <PipelineList
            steps={STEP_LABELS.map(({ k, d }) => ({ k, d }))}
            activeIdx={0}
          />
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .generate-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
