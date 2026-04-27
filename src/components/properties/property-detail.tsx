"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Info,
  Image as ImageIcon,
  Video,
  PenLine,
  Pencil,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAssets } from "@/hooks/use-assets";
import { useEngineGenerate } from "@/hooks/use-engine-generate";
import { useProcess } from "@/hooks/use-process";
import { InfoTab } from "./tabs/info-tab";
import { PhotosTab } from "./tabs/photos-tab";
import { VideosTab } from "./tabs/videos-tab";
import { CopyTab } from "./tabs/copy-tab";
import {
  AIEnhancementModal,
  type PresetSelection,
} from "./modals/ai-enhancement-modal";
import { ShareModal } from "./modals/share-modal";
import { useI18n } from "@/lib/i18n/client";
import {
  FALLBACK_PRESETS,
  findFallbackPreset,
  DEFAULT_ENHANCEMENT_MODEL,
  type EnhancementPreset,
} from "@/lib/ai/enhancement-presets";

/**
 * Minimal asset shape used by the preview-selection callback. We deliberately
 * keep this loose to avoid coupling to the full Supabase row type — only the
 * id is consumed by the parent here. Photos/Videos tabs have richer shapes,
 * but the parent only needs to know which row to swap into the preview.
 */
export interface SelectableAsset {
  id: string;
  asset_type: "image" | "video";
}

export interface PropertyData {
  street: string;
  streetNumber: string;
  neighborhood: string;
  city: string;
  propertyType: string;
  rooms: string;
  floor: string;
  totalFloors: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerPhone: string;
  ownerEmail: string;
  price: string;
  size: string;
  description: string;
  features: string[];
}

const defaultPropertyData: PropertyData = {
  street: "",
  streetNumber: "",
  neighborhood: "",
  city: "",
  propertyType: "Apartment",
  rooms: "",
  floor: "",
  totalFloors: "",
  ownerFirstName: "",
  ownerLastName: "",
  ownerPhone: "",
  ownerEmail: "",
  price: "",
  size: "",
  description: "",
  features: [],
};

type TabId = "info" | "photos" | "videos" | "copy";

interface Tab {
  id: TabId;
  Icon: React.ComponentType<{ size?: number }>;
}

const TABS: Tab[] = [
  { id: "info", Icon: Info },
  { id: "photos", Icon: ImageIcon },
  { id: "videos", Icon: Video },
  { id: "copy", Icon: PenLine },
];

interface Property {
  id: string;
  name: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  property_address?: string | null;
}

interface PropertyDetailProps {
  projectId: string;
  property: Property;
}

export function PropertyDetail({ projectId, property }: PropertyDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>("photos");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [actionAssetIds, setActionAssetIds] = useState<string[]>([]);
  const [presets, setPresets] = useState<EnhancementPreset[]>(FALLBACK_PRESETS);
  const { t } = useI18n();
  const engineGenerate = useEngineGenerate();
  const process = useProcess();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/presets")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !body || !Array.isArray(body.presets)) return;
        setPresets(body.presets as EnhancementPreset[]);
      })
      .catch(() => {
        // keep fallback
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Inline rename state
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(property.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [propertyName, setPropertyName] = useState(property.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const metaProperty =
    property.metadata &&
    typeof property.metadata === "object" &&
    "property" in property.metadata
      ? (property.metadata.property as Partial<PropertyData>)
      : null;

  const [propertyData, setPropertyData] = useState<PropertyData>({
    ...defaultPropertyData,
    ...(metaProperty ?? {}),
  });

  const { data: assets } = useAssets(projectId);
  const queryClient = useQueryClient();

  const deleteAsset = useMutation({
    mutationFn: async (assetId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("assets")
        .delete()
        .eq("project_id", projectId)
        .eq("id", assetId);
      if (error) throw error;
    },
    onSuccess: (_data, assetId) => {
      if (selectedAssetId === assetId) {
        setSelectedAssetId(null);
      }
      queryClient.invalidateQueries({ queryKey: ["assets", projectId] });
      toast.success(t.properties.toasts.mediaDeleted);
    },
    onError: () => {
      toast.error(t.properties.toasts.mediaDeleteFailed);
    },
  });

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  const handleDataChange = (patch: Partial<PropertyData>) => {
    setPropertyData((prev) => ({ ...prev, ...patch }));
  };

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === propertyName) {
      setIsEditingName(false);
      setNameDraft(propertyName);
      return;
    }
    setIsSavingName(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("projects")
      .update({ name: trimmed })
      .eq("id", projectId);
    setIsSavingName(false);
    if (error) {
      toast.error(t.properties.toasts.nameSaveFailed);
      setNameDraft(propertyName);
    } else {
      setPropertyName(trimmed);
      toast.success(t.properties.toasts.nameSaved);
    }
    setIsEditingName(false);
  }

  const projectAssets = useMemo(() => assets ?? [], [assets]);

  const selectedVideoAsset = useMemo(() => {
    if (!selectedAssetId) return null;
    const hit = projectAssets.find((a) => a.id === selectedAssetId);
    return hit?.asset_type === "video" ? hit : null;
  }, [projectAssets, selectedAssetId]);

  const selectedVideoUrl =
    selectedVideoAsset?.processed_url ?? selectedVideoAsset?.original_url ?? null;

  const handleSelectAsset = (asset: SelectableAsset) => {
    if (asset.id === selectedAssetId) {
      setSelectedAssetId(null);
      requestAnimationFrame(() => setSelectedAssetId(asset.id));
    } else {
      setSelectedAssetId(asset.id);
    }
  };

  const handleCreateVideo = (assetIds: string[]) => {
    if (assetIds.length === 0) return;
    engineGenerate.mutate({
      projectId,
      imageAssetIds: assetIds,
      templateName: "luxury_30s",
    });
    setSelectedAssetId(assetIds[0] ?? null);
  };

  const handleAiSelect = (selection: PresetSelection) => {
    if (actionAssetIds.length === 0) return;
    let prompt: string;
    let model: string;
    if (selection.kind === "custom") {
      prompt = selection.prompt;
      model = DEFAULT_ENHANCEMENT_MODEL;
    } else {
      const fromDb = presets.find((p) => p.key === selection.key);
      const resolved = fromDb ?? findFallbackPreset(selection.key);
      prompt = resolved.prompt;
      model = resolved.model;
    }
    for (const assetId of actionAssetIds) {
      process.mutate({
        assetId,
        projectId,
        tool: "enhance",
        prompt,
        model,
      });
    }
  };

  return (
    <div
      className="property-detail mx-auto flex flex-col"
      style={{ maxWidth: 1024, gap: 22, color: "var(--fg-0)" }}
    >
      <style>{`
        .property-header { padding-block: 4px; }
        .property-title {
          font-size: clamp(24px, 5vw, 36px);
          line-height: 1.08;
          letter-spacing: -0.022em;
          font-weight: 400;
        }
        .property-tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 16px;
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          border: 0;
          cursor: pointer;
          transition:
            background-color .15s var(--ease),
            color .15s var(--ease),
            border-color .15s var(--ease);
        }
        .property-tab-content { padding: 20px 22px; }
        @media (max-width: 640px) {
          .property-detail { gap: 14px; }
          .property-header { padding-block: 0; }
          .property-tab-btn {
            padding: 11px 4px;
            gap: 5px;
            letter-spacing: 0.06em;
            font-size: 10.5px;
          }
          .property-tab-content { padding: 12px; }
        }
      `}</style>
      {/* ─── Header — title only; kicker + meta chips removed per design ─── */}
      <section className="property-header min-w-0">
        {isEditingName ? (
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveName();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setNameDraft(propertyName);
                setIsEditingName(false);
              }
            }}
            disabled={isSavingName}
            maxLength={120}
            className="serif property-title w-full bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
            style={{
              color: "var(--fg-0)",
              padding: 0,
              margin: 0,
              borderBottom: "1px solid oklch(0.66 0.12 75 / 0.6)",
            }}
            aria-label={t.properties.propertyName}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setNameDraft(propertyName);
              setIsEditingName(true);
            }}
            className="serif property-title group inline-flex min-w-0 items-center gap-2 cursor-text text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              color: "var(--fg-0)",
            }}
            title={t.properties.renameTitle}
          >
            <span className="min-w-0 break-words">{propertyName}</span>
            <Pencil
              size={16}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              style={{ color: "var(--fg-3)" }}
            />
          </button>
        )}

        <p
          className="property-header-tagline"
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            lineHeight: 1.45,
            color: "var(--fg-2)",
          }}
        >
          {t.properties.tagline}
        </p>

        {property.property_address && (
          <p
            className="property-header-address"
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: "var(--fg-3)",
            }}
          >
            {property.property_address}
          </p>
        )}
      </section>

      {/* ─── Single-column workspace — selection-driven actions live in the
            photo tab toolbar; the creator rail has been retired. ───────── */}
      <section className="property-stage">
        <style>{`
          .property-stage {
            display: flex;
            flex-direction: column;
            align-items: stretch;
          }
          .property-workspace {
            display: flex;
            flex-direction: column;
            gap: 16px;
            min-width: 0;
          }
        `}</style>

        <main className="property-workspace">
          {selectedVideoAsset && selectedVideoUrl && (
            <div className="card" style={{ padding: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <div className="min-w-0">
                  <div className="kicker" style={{ marginBottom: 4 }}>
                    {t.properties.selectedReel}
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "var(--fg-2)",
                    }}
                  >
                    {t.properties.selectedReelHint}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAssetId(null)}
                  className="mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
                  style={{
                    height: 30,
                    padding: "0 10px",
                    borderRadius: 8,
                    border: "1px solid var(--line-soft)",
                    background: "var(--bg-2)",
                    color: "var(--fg-2)",
                    fontSize: 11,
                    cursor: "pointer",
                    transition:
                      "background-color .15s var(--ease), color .15s var(--ease), border-color .15s var(--ease)",
                  }}
                >
                  {t.common.close}
                </button>
              </div>
              <div
                className="prop-img"
                data-tone="warm"
                style={{
                  aspectRatio: "16 / 10",
                  borderRadius: 10,
                  position: "relative",
                  overflow: "hidden",
                  background: "oklch(0.18 0.008 72)",
                }}
              >
                <video
                  key={`vid-${selectedVideoAsset.id}`}
                  src={selectedVideoUrl}
                  controls
                  playsInline
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    borderRadius: 10,
                    background: "black",
                  }}
                />
              </div>
            </div>
          )}

          <div
            className="card"
            style={{ padding: 0, overflow: "hidden", minWidth: 0 }}
          >
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--line-soft)",
                background: "var(--bg-2)",
              }}
            >
              {TABS.map((tab) => {
                const label = t.properties.tabs[tab.id];
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-label={label}
                    className="mono property-tab-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-inset"
                    style={{
                      background: isActive ? "var(--bg-1)" : "transparent",
                      color: isActive ? "var(--gold-hi)" : "var(--fg-2)",
                      borderBottom: isActive
                        ? "2px solid var(--gold)"
                        : "2px solid transparent",
                    }}
                  >
                    <tab.Icon size={14} />
                    <span className="property-tab-btn-label">{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="property-tab-content">
              {activeTab === "info" && (
                <InfoTab data={propertyData} onChange={handleDataChange} />
              )}
              {activeTab === "photos" && (
                <PhotosTab
                  projectId={projectId}
                  assets={projectAssets}
                  selectedAssetId={selectedAssetId}
                  onSelect={handleSelectAsset}
                  onDelete={(assetId) => deleteAsset.mutate(assetId)}
                  onAiEnhance={(ids) => {
                    setActionAssetIds(ids);
                    setAiModalOpen(true);
                  }}
                  onShare={(ids) => {
                    setActionAssetIds(ids);
                    setShareModalOpen(true);
                  }}
                  onCreateVideo={(picked) =>
                    handleCreateVideo(picked.map((p) => p.id))
                  }
                />
              )}
              {activeTab === "videos" && (
                <VideosTab
                  assets={projectAssets}
                  selectedAssetId={selectedAssetId}
                  onSelect={handleSelectAsset}
                  onDelete={(assetId) => deleteAsset.mutate(assetId)}
                />
              )}
              {activeTab === "copy" && (
                <CopyTab data={propertyData} onChange={handleDataChange} />
              )}
            </div>
          </div>
        </main>
      </section>

      <AIEnhancementModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        selectedCount={actionAssetIds.length}
        onSelect={handleAiSelect}
      />
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />
    </div>
  );
}
