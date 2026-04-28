"use client";

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Upload, ArrowRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCreateProperty } from "@/hooks/use-properties";
import { useEngineGenerate } from "@/hooks/use-engine-generate";
import { TEMPLATE_META, FALLBACK_META } from "@/components/templates/template-meta";
import { Field } from "@/components/upload/Field";
import type { TemplateName } from "@/lib/engine/models";

type Tone = "warm" | "amber" | "cool" | "sunset" | "mono";

const TONE_CYCLE: Tone[] = ["warm", "amber", "cool", "sunset", "warm"];

interface FileEntry {
  file: File;
  previewUrl: string;
  tone: Tone;
  label: string;
}

interface MetaState {
  title: string;
  addr: string;
  price: string;
  duration: "30" | "45" | "60";
  template: string;
}

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [meta, setMeta] = useState<MetaState>({
    title: "",
    addr: "",
    price: "",
    duration: "30",
    template: searchParams.get("template") ?? "luxury_30s",
  });
  const [submitting, setSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const createProperty = useCreateProperty();
  const engineGenerate = useEngineGenerate();

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    return () => {
      files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = files.length >= 4 && meta.title.trim().length > 0;

  const totalMB = (
    files.reduce((sum, f) => sum + f.file.size, 0) / 1_000_000
  ).toFixed(1);

  function addFiles(newFiles: File[]) {
    const entries: FileEntry[] = newFiles.map((file, i) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      tone: TONE_CYCLE[(files.length + i) % TONE_CYCLE.length],
      label: file.name.replace(/\.[^.]+$/, ""),
    }));
    setFiles((prev) => [...prev, ...entries]);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length) addFiles(selected);
    // reset so the same files can be re-added
    e.target.value = "";
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (dropped.length) addFiles(dropped);
  }

  const templateMeta = TEMPLATE_META[meta.template] ?? FALLBACK_META;

  async function handleGenerate() {
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      const project = await createProperty.mutateAsync({
        name: meta.title,
        property_address: meta.addr,
      });
      const projectId = project.id;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const assetIds: string[] = [];
      for (const f of files) {
        const r = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: f.file.name,
            contentType: f.file.type,
          }),
        });
        if (!r.ok) throw new Error("Failed to get upload URL");
        const { presignedUrl, publicUrl } = await r.json();

        const up = await fetch(presignedUrl, {
          method: "PUT",
          body: f.file,
          headers: { "Content-Type": f.file.type },
        });
        if (!up.ok) throw new Error("Upload failed");

        const { data: asset, error } = await supabase
          .from("assets")
          .insert({
            project_id: projectId,
            user_id: user.id,
            original_url: publicUrl,
            asset_type: "image",
            status: "uploaded",
          })
          .select()
          .single();
        if (error) throw error;
        assetIds.push(asset.id);
      }

      const result = await engineGenerate.mutateAsync({
        projectId,
        imageAssetIds: assetIds,
        templateName: meta.template as TemplateName,
      });

      router.push(
        `/dashboard/generate?assetId=${result.resultAssetId}&projectId=${projectId}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="mx-auto flex flex-col"
      style={{ maxWidth: 1280, gap: 22, color: "var(--fg-0)" }}
    >
      {/* Header */}
      <div>
        <div className="kicker" style={{ marginBottom: 8 }}>
          <span style={{ color: "var(--gold-hi)" }}>01</span> · upload media
        </div>
        <h1
          className="serif"
          style={{
            fontSize: "clamp(30px, 4vw, 40px)",
            margin: 0,
            letterSpacing: "-0.025em",
          }}
        >
          Drop your{" "}
          <span style={{ fontStyle: "italic" }} className="gold-text">
            listing photos
          </span>
        </h1>
        <p
          style={{
            color: "var(--fg-2)",
            fontSize: 13.5,
            marginTop: 8,
            maxWidth: 480,
          }}
        >
          We recommend 8–24 photos — interiors, exteriors, and one hero shot.
          JPEG, HEIC, or RAW.
        </p>
      </div>

      {/* 2-col grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 16,
          alignItems: "flex-start",
        }}
        className="upload-grid"
      >
        {/* Left column — drop zone + thumbnails */}
        <div className="card" style={{ padding: 18 }}>
          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
              border: "1.5px dashed oklch(0.66 0.12 75 / 0.4)",
              borderRadius: 12,
              background: "oklch(0.66 0.12 75 / 0.04)",
              padding: "28px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              gap: 10,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: "oklch(0.66 0.12 75 / 0.10)",
                border: "1px solid oklch(0.66 0.12 75 / 0.30)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--gold-hi)",
              }}
            >
              <Upload size={16} />
            </div>
            <div style={{ fontSize: 14 }}>
              Drag photos here, or{" "}
              <span
                onClick={() => inputRef.current?.click()}
                style={{
                  color: "var(--gold-hi)",
                  textDecoration: "underline",
                  textDecorationColor: "oklch(0.66 0.12 75 / 0.5)",
                  textUnderlineOffset: 3,
                  cursor: "pointer",
                }}
              >
                browse
              </span>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 11.5,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
              }}
            >
              jpeg · heic · raw · up to 50 mb each
            </div>

            {/* Hidden file input */}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleInputChange}
              style={{ display: "none" }}
            />
          </div>

          {/* Meta row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 18,
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--fg-1)" }}>
              <span className="mono" style={{ color: "var(--gold-hi)" }}>
                {files.length}
              </span>{" "}
              files ·{" "}
              <span style={{ color: "var(--fg-3)" }}>{totalMB} MB total</span>
            </div>
            <button
              style={{
                background: "none",
                border: 0,
                color: "var(--fg-3)",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
                cursor: "default",
              }}
            >
              REORDER
            </button>
          </div>

          {/* Thumbnails grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 8,
            }}
          >
            {files.map((f, i) => (
              <div key={f.previewUrl} style={{ position: "relative" }}>
                <div
                  className="prop-img"
                  data-tone={f.tone}
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: 6,
                    border:
                      i === 0
                        ? "1px solid var(--gold)"
                        : "1px solid var(--line-soft)",
                    boxShadow:
                      i === 0
                        ? "0 0 0 3px oklch(0.66 0.12 75 / 0.15)"
                        : "none",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={f.previewUrl}
                    alt=""
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: 6,
                    }}
                  />
                </div>
                {i === 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      left: 4,
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--on-gold)",
                      background: "var(--gold)",
                      padding: "2px 5px",
                      borderRadius: 3,
                    }}
                  >
                    HERO
                  </div>
                )}
                <div
                  style={{
                    position: "absolute",
                    bottom: 4,
                    left: 4,
                    right: 4,
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.08em",
                    color: "oklch(0.95 0.02 80 / 0.85)",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {f.label || `Image ${i + 1}`}
                </div>
              </div>
            ))}

            {/* Add more button */}
            <button
              onClick={() => inputRef.current?.click()}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 6,
                border: "1px dashed var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--fg-3)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Right column — listing details */}
        <div className="card" style={{ padding: 22 }}>
          <div className="kicker" style={{ marginBottom: 14 }}>
            Listing details
          </div>

          <Field label="Title">
            <input
              value={meta.title}
              onChange={(e) => setMeta({ ...meta, title: e.target.value })}
              placeholder="Marina Sky Penthouse"
            />
          </Field>

          <Field label="Address">
            <input
              value={meta.addr}
              onChange={(e) => setMeta({ ...meta, addr: e.target.value })}
              placeholder="88 Harbor View, Miami Beach"
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Asking price">
              <input
                value={meta.price}
                onChange={(e) => setMeta({ ...meta, price: e.target.value })}
                placeholder="$8.4M"
              />
            </Field>

            <Field label="Duration">
              <div className="seg" style={{ width: "100%" }}>
                {(["30", "45", "60"] as const).map((d) => (
                  <button
                    key={d}
                    aria-pressed={meta.duration === d}
                    onClick={() => setMeta({ ...meta, duration: d })}
                    style={{ flex: 1 }}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Template">
            <div
              style={{
                padding: 10,
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
                background: "var(--bg-2)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                className="prop-img"
                data-tone={templateMeta.tone}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>
                  {/* TODO: template-meta.ts doesn't expose a display name; using style as name */}
                  {templateMeta.style}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--fg-3)",
                  }}
                >
                  {templateMeta.style} · {templateMeta.durationLabel}
                </div>
              </div>
              <button
                className="btn btn-ghost"
                style={{ height: 28, fontSize: 11.5, padding: "0 10px" }}
                onClick={() => router.push("/dashboard/templates")}
              >
                Change
              </button>
            </div>
          </Field>

          <div className="hr" style={{ margin: "16px 0 14px" }} />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              fontSize: 11.5,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.04em",
              color: "var(--fg-2)",
            }}
          >
            <span>1 credit · ~ 2 min render</span>
            <span style={{ color: "var(--fg-3)" }}>46 left</span>
          </div>

          <button
            className="btn-generate"
            disabled={!ready || submitting}
            onClick={handleGenerate}
            style={{
              width: "100%",
              justifyContent: "center",
              height: 44,
              fontSize: 14,
              opacity: ready ? 1 : 0.5,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {submitting ? "Generating…" : "Generate reel"}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .upload-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
