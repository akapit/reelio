"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Eye,
  Image as ImageIcon,
  Loader2,
  Plus,
  Share2,
  Trash2,
  Upload,
  Video,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectableAsset } from "@/components/properties/property-detail";
import { useI18n } from "@/lib/i18n/client";
import { useUpload } from "@/hooks/use-upload";
import { ROOM_TYPES, isRoomType, type RoomType } from "@/lib/rooms";
import { ImagePreviewModal } from "@/components/properties/modals/image-preview-modal";

const ACCEPTED_FILE_TYPES = "image/*,video/*";

interface PhotoTabAsset {
  id: string;
  asset_type: string;
  status: string;
  original_url?: string | null;
  thumbnail_url?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreatorPhotoAsset {
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
}

interface PhotosTabProps {
  projectId: string;
  assets?: PhotoTabAsset[];
  /** Id of the asset currently shown in the parent preview pane. */
  selectedAssetId?: string | null;
  /** Click handler — parent swaps the preview to this asset. */
  onSelect?: (asset: SelectableAsset) => void;
  /** Deletes this asset row from the project. */
  onDelete?: (assetId: string) => void;
  /** Opens AI enhancement modal for the selected photo ids. */
  onAiEnhance?: (assetIds: string[]) => void;
  /** Opens share modal for the selected photo ids. */
  onShare?: (assetIds: string[]) => void;
  /** Dispatches video generation for the selected photos. */
  onCreateVideo?: (assets: CreatorPhotoAsset[]) => void;
}

type ActionVariant = "video" | "ai" | "share";

function ActionPill({
  onClick,
  variant,
  icon,
  label,
  disabled,
}: {
  onClick: () => void;
  variant: ActionVariant;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      className="btn-action"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function getRoomType(asset: PhotoTabAsset): RoomType | null {
  const meta = asset.metadata;
  const value = meta && typeof meta === "object" ? (meta as Record<string, unknown>).roomType : null;
  return isRoomType(value) ? value : null;
}

function RoomTypePill({
  current,
  onChange,
  loading,
  labels,
  detectingLabel,
  fallbackLabel,
}: {
  current: RoomType | null;
  onChange: (next: RoomType) => void;
  loading?: boolean;
  labels: Record<RoomType, string>;
  detectingLabel: string;
  fallbackLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = current
    ? labels[current]
    : loading
      ? detectingLabel
      : fallbackLabel;

  return (
    <div ref={ref} className="relative mx-auto inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "rounded-full border border-[var(--line-soft)] bg-[var(--bg-1)] px-3 py-0.5 text-[11px] text-[var(--fg-2)]",
          "transition-colors duration-150 hover:border-[var(--gold)]/60 hover:text-[var(--fg-0)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-1/2 z-40 mt-1 max-h-64 w-44 -translate-x-1/2 overflow-y-auto rounded-lg border border-[var(--line-soft)] bg-[var(--bg-1)] py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {ROOM_TYPES.map((type) => (
            <li key={type}>
              <button
                type="button"
                role="option"
                aria-selected={current === type}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(type);
                  setOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-start text-[12px] transition-colors",
                  current === type
                    ? "bg-[var(--gold-tint)] text-[var(--fg-0)]"
                    : "text-[var(--fg-1)] hover:bg-[var(--bg-2)]",
                )}
              >
                {labels[type]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PhotosTab({
  projectId,
  assets = [],
  selectedAssetId,
  onSelect,
  onDelete,
  onAiEnhance,
  onShare,
  onCreateVideo,
}: PhotosTabProps) {
  const { t } = useI18n();
  // Silently fire a server-side thumbnail backfill the first time we mount
  // and detect images missing thumbnails. The endpoint is idempotent (it
  // selects WHERE thumbnail_url IS NULL), and Supabase Realtime will refresh
  // the grid as rows get updated.
  const backfilledRef = useRef(false);
  const missingThumbCount = assets.filter(
    (a) => a.asset_type === "image" && !!a.original_url && !a.thumbnail_url,
  ).length;
  useEffect(() => {
    if (backfilledRef.current) return;
    if (missingThumbCount === 0) return;
    backfilledRef.current = true;
    fetch("/api/assets/backfill-thumbnails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    }).catch((err) => {
      console.warn("[backfill] kickoff failed", err);
    });
  }, [missingThumbCount, projectId]);

  // Auto-detect room types for any asset still missing one. Same idempotent
  // pattern as thumbnails — keeps firing until the server reports 0 results.
  const detectingRef = useRef<{ inFlight: boolean; cooldownUntil: number }>({
    inFlight: false,
    cooldownUntil: 0,
  });
  const missingRoomCount = assets.filter(
    (a) => a.asset_type === "image" && a.status === "uploaded" && !getRoomType(a),
  ).length;
  useEffect(() => {
    if (missingRoomCount === 0) return;
    if (detectingRef.current.inFlight) return;
    if (Date.now() < detectingRef.current.cooldownUntil) return;
    detectingRef.current.inFlight = true;
    fetch("/api/assets/detect-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
      .catch((err) => {
        console.warn("[detect-room] kickoff failed", err);
      })
      .finally(() => {
        detectingRef.current.inFlight = false;
        detectingRef.current.cooldownUntil = Date.now() + 4_000;
      });
  }, [missingRoomCount, projectId]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [optimisticRoomTypes, setOptimisticRoomTypes] = useState<
    Record<string, RoomType>
  >({});

  const upload = useUpload(projectId);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const isUploading = upload.isPending;

  const openFilePicker = () => uploadInputRef.current?.click();

  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => upload.mutate(file));
    e.target.value = "";
  };

  const handleRoomTypeChange = (assetId: string, next: RoomType) => {
    setOptimisticRoomTypes((prev) => ({ ...prev, [assetId]: next }));
    fetch("/api/assets/room-type", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, roomType: next }),
    }).catch((err) => {
      console.warn("[room-type] update failed", err);
    });
  };

  // A photo is "ready" once it has a usable original_url and isn't actively
  // failing or processing. Source uploads land with status="uploaded";
  // AI-generated outputs land with status="done". Both are valid select
  // sources for the action pills.
  const isReady = (photo: PhotoTabAsset) =>
    !!photo.original_url &&
    photo.status !== "processing" &&
    photo.status !== "failed";

  const photos = assets.filter((a) => a.asset_type === "image");

  const toCreatorPhoto = (photo: (typeof photos)[number]): CreatorPhotoAsset | null => {
    const originalUrl = photo.original_url ?? "";
    if (!isReady(photo) || !originalUrl) return null;
    const thumbnailUrl =
      (photo as { thumbnail_url?: string | null }).thumbnail_url ??
      originalUrl;
    return {
      id: photo.id,
      originalUrl,
      thumbnailUrl,
    };
  };

  const toggleSelected = (photoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const pickedCreatorPhotos = (): CreatorPhotoAsset[] =>
    photos
      .filter((photo) => selectedIds.has(photo.id))
      .map(toCreatorPhoto)
      .filter((photo): photo is CreatorPhotoAsset => photo !== null);

  const handleCreateVideo = () => {
    const picked = pickedCreatorPhotos();
    if (picked.length === 0) return;
    onCreateVideo?.(picked);
    setSelectedIds(new Set());
  };

  const handleAiEnhance = () => {
    if (selectedIds.size === 0) return;
    onAiEnhance?.(Array.from(selectedIds));
  };

  const handleShare = () => {
    if (selectedIds.size === 0) return;
    onShare?.(Array.from(selectedIds));
  };

  if (photos.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: "56px 0",
        }}
      >
        <input
          ref={uploadInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          multiple
          className="sr-only"
          onChange={handleFilesPicked}
          disabled={isUploading}
        />
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: "var(--gold-tint)",
            border: "1px solid var(--gold-tint-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ImageIcon size={22} style={{ color: "var(--gold-hi)" }} />
        </div>
        <p
          className="serif"
          style={{
            fontSize: 20,
            letterSpacing: "-0.015em",
            color: "var(--fg-0)",
            margin: 0,
          }}
        >
          {t.photos.empty}
        </p>
        <p
          className="kicker"
          style={{ color: "var(--fg-3)", margin: 0 }}
        >
          {t.photos.emptyHint}
        </p>
        <button
          type="button"
          onClick={openFilePicker}
          disabled={isUploading}
          className="btn-generate"
          style={{ marginTop: 4 }}
        >
          {isUploading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {t.photos.uploading}
            </>
          ) : (
            <>
              <Upload size={14} />
              {t.photos.uploadPhotos}
            </>
          )}
        </button>
      </div>
    );
  }

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="space-y-3">
      <input
        ref={uploadInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        multiple
        className="sr-only"
        onChange={handleFilesPicked}
        disabled={isUploading}
      />
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-1 py-1"
        role="toolbar"
        aria-label={t.photos.sourceActions}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--fg-0)]">
            {t.photos.uploadedHeading}
          </h3>
          <button
            type="button"
            onClick={openFilePicker}
            disabled={isUploading}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-[var(--line-soft)]",
              "bg-[var(--bg-1)] px-2.5 py-1 text-[12px] text-[var(--fg-1)]",
              "transition-colors duration-150",
              "hover:border-[var(--gold)]/60 hover:text-[var(--fg-0)]",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]",
            )}
          >
            {isUploading ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>{t.photos.uploading}</span>
              </>
            ) : (
              <>
                <Plus size={12} />
                <span>{t.photos.addMorePhotos}</span>
              </>
            )}
          </button>
        </div>
        {hasSelection && (
          <div className="flex items-center gap-2">
            <ActionPill
              onClick={handleCreateVideo}
              variant="video"
              icon={<Video size={14} strokeWidth={2.25} />}
              label={t.photos.actionVideo}
            />
            <ActionPill
              onClick={handleAiEnhance}
              variant="ai"
              icon={<Wand2 size={14} strokeWidth={2.25} />}
              label={t.photos.actionAi}
            />
            <ActionPill
              onClick={handleShare}
              variant="share"
              icon={<Share2 size={14} strokeWidth={2.25} />}
              label={t.photos.actionShare}
            />
          </div>
        )}
      </div>

      <div
        // auto-fill packs as many cells as fit with a sensible min width,
        // so the grid scales naturally from phone (2 cols) to desktop (5+)
        // without depending on a parent's @media breakpoint matching. The
        // mobile media query below tightens min-width + gap so we don't waste
        // gutter space on narrow screens.
        className="photos-tab-grid"
      >
        <style>{`
          .photos-tab-grid {
            --photos-grid-gap: 12px;
            --photos-grid-cap: 5;
            --photos-grid-max: 1024px;
            display: grid;
            /* min-cell width = max(120px, share-of-row-for-cap-cols), so on
               wide screens we get exactly 'cap' columns and on narrow screens
               we collapse gracefully. */
            grid-template-columns: repeat(
              auto-fill,
              minmax(
                max(120px, calc((100% - (var(--photos-grid-cap) - 1) * var(--photos-grid-gap)) / var(--photos-grid-cap))),
                1fr
              )
            );
            gap: var(--photos-grid-gap);
            width: 100%;
            max-width: var(--photos-grid-max);
            margin-inline: auto;
          }
          @media (max-width: 640px) {
            .photos-tab-grid {
              --photos-grid-gap: 8px;
              --photos-grid-cap: 3;
              grid-template-columns: repeat(
                auto-fill,
                minmax(
                  max(96px, calc((100% - (var(--photos-grid-cap) - 1) * var(--photos-grid-gap)) / var(--photos-grid-cap))),
                  1fr
                )
              );
            }
          }
        `}</style>
        {photos.map((photo, index) => {
          const thumbnailUrl =
            (photo as { thumbnail_url?: string | null }).thumbnail_url ??
            photo.original_url ??
            undefined;
          const isPreview = selectedAssetId === photo.id;
          const canAdd = isReady(photo);
          const isPicked = selectedIds.has(photo.id);
          const showRing = isPicked || isPreview;

          const handleTap = () => {
            if (!canAdd) return;
            const willSelect = !isPicked;
            toggleSelected(photo.id);
            if (willSelect) {
              onSelect?.({ id: photo.id, asset_type: "image" });
            }
          };

          return (
            <div key={photo.id} className="flex flex-col items-stretch gap-1.5">
              <div
                className={cn(
                  "prop-img group relative",
                  "focus-within:ring-2 focus-within:ring-[var(--gold)]",
                )}
                data-tone="warm"
                role="button"
                tabIndex={canAdd ? 0 : -1}
                aria-label={isPicked ? "Selected photo" : "Select this photo"}
                aria-pressed={isPicked}
                onClick={handleTap}
                onKeyDown={(e) => {
                  if (!canAdd) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleTap();
                  }
                }}
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: 10,
                  border: showRing
                    ? "2px solid var(--gold)"
                    : "1px solid var(--line-soft)",
                  boxShadow: showRing
                    ? "0 0 0 3px oklch(0.66 0.12 75 / 0.18)"
                    : undefined,
                  padding: 0,
                  cursor: canAdd ? "pointer" : "default",
                  transition:
                    "border-color .15s var(--ease), box-shadow .15s var(--ease)",
                  overflow: "hidden",
                  background: "transparent",
                  textAlign: "left",
                }}
              >
                {thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnailUrl}
                    alt="Property source photo"
                    draggable={false}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transition: "transform 0.2s var(--ease)",
                      pointerEvents: "none",
                    }}
                    className="group-hover:scale-105"
                  />
                ) : (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "oklch(0.95 0.02 80 / 0.55)",
                    }}
                  >
                    <ImageIcon size={28} />
                  </div>
                )}

                {/* Index badge — always visible, top-leading */}
                <div
                  className="pointer-events-none absolute start-2 top-2 z-20 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-900/80 px-1.5 text-[11px] font-semibold text-white shadow-sm backdrop-blur"
                  aria-hidden="true"
                >
                  {index + 1}
                </div>

                {!isPicked && (thumbnailUrl ?? photo.original_url) && (
                  <div
                    className={cn(
                      "pointer-events-none absolute end-2 top-2 z-30 flex items-center gap-1.5",
                      "opacity-100 transition-opacity duration-150",
                      "sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                    )}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewUrl(photo.original_url ?? thumbnailUrl ?? null);
                      }}
                      className={cn(
                        "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full",
                        "border border-white/45 bg-black/45 text-white shadow-sm backdrop-blur",
                        "transition-colors duration-150 hover:border-white/80 hover:bg-black/70",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                      )}
                      aria-label={t.photos.preview}
                      title={t.photos.preview}
                    >
                      <Eye size={14} />
                    </button>
                    {onDelete && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(photo.id);
                        }}
                        className={cn(
                          "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full",
                          "border border-white/45 bg-black/45 text-white shadow-sm backdrop-blur",
                          "transition-colors duration-150 hover:border-red-300/80 hover:bg-red-500/90",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300",
                        )}
                        aria-label={t.photos.deletePhoto}
                        title={t.common.delete}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}

                {isPicked && (
                  <div
                    className="pointer-events-none absolute bottom-2 end-2 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--gold)] text-[var(--on-gold)] shadow-md ring-2 ring-white/80"
                    aria-hidden="true"
                  >
                    <Check size={14} strokeWidth={3} />
                  </div>
                )}

                {photo.status === "processing" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.45)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        border: "2px solid white",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                  </div>
                )}
                {photo.status === "failed" && (
                  <span
                    className="mono"
                    style={{
                      position: "absolute",
                      top: 6,
                      insetInlineStart: 6,
                      fontSize: 11,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "white",
                      background: "oklch(0.55 0.18 25)",
                      padding: "2px 7px",
                      borderRadius: 4,
                    }}
                  >
                    Failed
                  </span>
                )}
              </div>

              <RoomTypePill
                current={optimisticRoomTypes[photo.id] ?? getRoomType(photo)}
                loading={photo.status === "uploaded"}
                onChange={(next) => handleRoomTypeChange(photo.id, next)}
                labels={t.photos.roomTypes}
                detectingLabel={t.photos.detectingRoom}
                fallbackLabel={t.photos.roomTag}
              />
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <ImagePreviewModal
        open={previewUrl !== null}
        imageUrl={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />
    </div>
  );
}
