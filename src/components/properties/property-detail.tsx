"use client";

import { useEffect, useRef, useState } from "react";
import { Info, Image as ImageIcon, Video, PenLine, MapPin, Calendar, Pencil } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAssets } from "@/hooks/use-assets";
import { CreationBar } from "@/components/media/CreationBar";
import { InfoTab } from "./tabs/info-tab";
import { PhotosTab } from "./tabs/photos-tab";
import { VideosTab } from "./tabs/videos-tab";
import { CopyTab } from "./tabs/copy-tab";
import { cn } from "@/lib/utils";

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
  propertyType: "דירה",
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
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const TABS: Tab[] = [
  { id: "info", label: "מידע", Icon: Info },
  { id: "photos", label: "תמונות", Icon: ImageIcon },
  { id: "videos", label: "סרטונים", Icon: Video },
  { id: "copy", label: "קופי", Icon: PenLine },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

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
  const [selectedPreview, setSelectedPreview] = useState<{
    type: "photo" | "video";
    id: string;
    url: string;
  } | null>(null);

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
      toast.error("שגיאה בשמירת השם");
      setNameDraft(propertyName);
    } else {
      setPropertyName(trimmed);
      toast.success("השם עודכן");
    }
    setIsEditingName(false);
  }

  const previewAssets = assets ?? [];
  const previewAsset = selectedPreview
    ? previewAssets.find((a) => a.id === selectedPreview.id)
    : previewAssets[0];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Property header */}
      <div className="mb-6 space-y-1.5">
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
              className={cn(
                "w-full bg-transparent outline-none",
                "text-2xl lg:text-3xl font-semibold text-slate-900 leading-tight",
                "border-b border-amber-500/60 focus:border-amber-600",
                "pb-0.5 -mb-0.5",
              )}
              style={{ fontFamily: "var(--font-display)" }}
              aria-label="שם הנכס"
              dir="rtl"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setNameDraft(propertyName);
                setIsEditingName(true);
              }}
              className={cn(
                "group inline-flex items-center gap-2 text-right",
                "text-2xl lg:text-3xl font-semibold text-slate-900 leading-tight",
                "rounded-md -mx-1 px-1 transition-colors duration-150",
                "hover:bg-stone-100/70 cursor-text",
              )}
              style={{ fontFamily: "var(--font-display)" }}
              title="לחץ לשינוי שם"
            >
              <span>{propertyName}</span>
              <Pencil
                size={14}
                className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              />
            </button>
          )}

          <div className="flex flex-wrap items-center gap-4">
            {property.property_address && (
              <div className="flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin size={13} />
                <span>{property.property_address}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <Calendar size={13} />
              <span>נוצר {formatDate(property.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Desktop preview + gallery panel — Gallery first so RTL grid places it on the right.
            5-col grid: gallery takes 2/5 (right, narrower), preview takes 3/5 (left, wider). */}
        <div className="hidden md:grid md:grid-cols-5 gap-6 lg:gap-8 mb-6 lg:mb-8">
          {/* Gallery panel */}
          <div className="md:col-span-2 bg-white rounded-xl shadow-lg border border-stone-200 p-5 lg:p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 text-right">
              גלריה
            </h2>
            {previewAssets.length > 0 ? (
              <div className="grid grid-cols-3 lg:grid-cols-4 gap-2 lg:gap-3 max-h-[420px] overflow-y-auto pr-1">
                {previewAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() =>
                      setSelectedPreview({
                        type: asset.asset_type === "video" ? "video" : "photo",
                        id: asset.id,
                        url: asset.original_url ?? "",
                      })
                    }
                    className={`aspect-square bg-stone-100 rounded-lg overflow-hidden cursor-pointer transition-all ring-2 ${
                      previewAsset?.id === asset.id
                        ? "ring-amber-600"
                        : "ring-transparent hover:ring-amber-300"
                    }`}
                  >
                    {asset.asset_type === "video" ? (
                      <div className="w-full h-full flex items-center justify-center bg-slate-200">
                        <Video className="w-6 h-6 text-slate-500" />
                      </div>
                    ) : (
                      <img
                        src={
                          (asset as { thumbnail_url?: string | null })
                            .thumbnail_url ??
                          asset.original_url ??
                          undefined
                        }
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 lg:grid-cols-4 gap-2 lg:gap-3 max-h-[420px] overflow-y-auto pr-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square bg-stone-100 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Preview panel */}
          <div className="md:col-span-3 bg-white rounded-xl shadow-lg border border-stone-200 p-5 lg:p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 text-right">
              תצוגה מקדימה
            </h2>
            {previewAsset ? (
              previewAsset.asset_type === "video" ? (
                <video
                  src={previewAsset.original_url ?? undefined}
                  controls
                  className="w-full aspect-video object-cover rounded-lg bg-black"
                />
              ) : (
                <img
                  src={
                    (previewAsset as { thumbnail_url?: string | null })
                      .thumbnail_url ??
                    previewAsset.original_url ??
                    undefined
                  }
                  alt="תצוגה מקדימה"
                  className="w-full aspect-video object-cover rounded-lg"
                />
              )
            ) : (
              <div className="aspect-video bg-gradient-to-br from-slate-100 to-stone-100 rounded-lg flex items-center justify-center">
                <ImageIcon className="w-12 h-12 text-stone-300" />
              </div>
            )}
          </div>
        </div>

        {/* CreationBar — primary upload + create-video surface, always visible above the tabs */}
        <div className="mb-6">
          <CreationBar projectId={projectId} />
        </div>

        {/* Tabs container */}
        <div className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
          {/* Tab bar */}
          <div className="grid grid-cols-4 md:flex border-b border-stone-200">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 py-3 md:py-4 text-sm font-medium transition-all border-b-4 ${
                    isActive
                      ? "bg-gradient-to-br md:bg-gradient-to-r from-amber-50 to-stone-50 border-amber-600 text-amber-900"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-stone-50"
                  }`}
                >
                  <tab.Icon className="w-4 h-4 md:w-5 md:h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="p-4 md:p-6">
            {activeTab === "info" && (
              <InfoTab data={propertyData} onChange={handleDataChange} />
            )}
            {activeTab === "photos" && <PhotosTab projectId={projectId} />}
            {activeTab === "videos" && <VideosTab projectId={projectId} />}
            {activeTab === "copy" && (
              <CopyTab data={propertyData} onChange={handleDataChange} />
            )}
          </div>
        </div>
    </div>
  );
}
