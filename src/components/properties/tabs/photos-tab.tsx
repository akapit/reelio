"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckSquare,
  Image as ImageIcon,
  MousePointer2,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectableAsset } from "@/components/properties/property-detail";

interface PhotoTabAsset {
  id: string;
  asset_type: string;
  status: string;
  original_url?: string | null;
  thumbnail_url?: string | null;
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
  /** Adds one or more done photos into the persistent creator rail. */
  onAddToCreator?: (assets: CreatorPhotoAsset[]) => void;
}

export function PhotosTab({
  projectId,
  assets = [],
  selectedAssetId,
  onSelect,
  onAddToCreator,
}: PhotosTabProps) {
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
  // Track which card is mid-drag so we can ghost it (visual feedback for
  // drag-to-creation-bar). Cleared on `dragend` regardless of where the drop
  // landed.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // A photo is "ready" once it has a usable original_url and isn't actively
  // failing or processing. Source uploads land with status="uploaded";
  // AI-generated outputs land with status="done". Both are valid drag/select
  // sources for the creator bar.
  const isReady = (photo: PhotoTabAsset) =>
    !!photo.original_url &&
    photo.status !== "processing" &&
    photo.status !== "failed";

  const photos = assets.filter((a) => a.asset_type === "image");
  const readyPhotos = photos.filter(isReady);

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

  const addOne = (photo: (typeof photos)[number]) => {
    const creatorPhoto = toCreatorPhoto(photo);
    if (!creatorPhoto) return;
    onAddToCreator?.([creatorPhoto]);
    onSelect?.({ id: photo.id, asset_type: "image" });
  };

  const addSelected = () => {
    if (selectedIds.size === 0) return;
    const picked = photos
      .filter((photo) => selectedIds.has(photo.id))
      .map(toCreatorPhoto)
      .filter((photo): photo is CreatorPhotoAsset => photo !== null);
    if (picked.length === 0) return;
    onAddToCreator?.(picked);
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (photoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
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
          No photos yet
        </p>
        <p
          className="kicker"
          style={{ color: "var(--fg-3)", margin: 0 }}
        >
          Upload images from the creation surface above
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-2)] px-3 py-2"
        role="toolbar"
        aria-label="Photo source actions"
      >
        <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--fg-2)]">
          <MousePointer2 size={14} className="shrink-0 text-[var(--gold)]" />
          <span className="truncate">
            Add photos into the creator, or drag ready photos to the rail.
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {selectionMode && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedIds(new Set(readyPhotos.map((photo) => photo.id)));
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-2)] transition-colors duration-150 hover:bg-[var(--bg-1)] hover:text-[var(--fg-0)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={addSelected}
                disabled={selectedIds.size === 0}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]",
                  selectedIds.size === 0
                    ? "cursor-not-allowed bg-[var(--bg-3)] text-[var(--fg-4)]"
                    : "bg-[var(--gold)] text-[var(--on-gold)] hover:bg-[var(--gold-hi)]",
                )}
              >
                <Plus size={13} />
                Add {selectedIds.size || ""}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setSelectionMode((prev) => !prev);
              setSelectedIds(new Set());
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]",
              selectionMode
                ? "bg-[var(--gold-tint)] text-[var(--gold-lo)]"
                : "border border-[var(--line-soft)] bg-[var(--bg-1)] text-[var(--fg-2)] hover:text-[var(--fg-0)]",
            )}
          >
            {selectionMode ? <X size={13} /> : <CheckSquare size={13} />}
            {selectionMode ? "Cancel" : "Select"}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          // auto-fill packs as many cells as fit with a sensible min width,
          // so the grid scales naturally from phone (2 cols) to desktop (5+)
          // without depending on a parent's @media breakpoint matching.
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 12,
          width: "100%",
        }}
        className="photos-tab-grid"
      >
        {photos.map((photo) => {
          const thumbnailUrl =
            (photo as { thumbnail_url?: string | null }).thumbnail_url ??
            photo.original_url ??
            undefined;
          const originalUrl = photo.original_url ?? "";
          const isSelected = selectedAssetId === photo.id;
          const isDragging = draggingId === photo.id;
          const canAdd = isReady(photo);
          const isPicked = selectedIds.has(photo.id);

          return (
            <div
              key={photo.id}
              className={cn(
                "prop-img group relative",
                "focus-within:ring-2 focus-within:ring-[var(--gold)]",
              )}
              data-tone="warm"
              draggable={canAdd}
              onDragStart={(e) => {
                if (!canAdd) {
                  e.preventDefault();
                  return;
                }
                const payload = {
                  id: photo.id,
                  originalUrl,
                  thumbnailUrl: thumbnailUrl ?? originalUrl,
                  assetType: "image" as const,
                };
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData(
                  "application/reelio-asset",
                  JSON.stringify(payload),
                );
                setDraggingId(photo.id);
              }}
              onDragEnd={() => setDraggingId(null)}
              role="button"
              tabIndex={canAdd ? 0 : -1}
              aria-label={isSelected ? "Selected photo" : "Select this photo"}
              aria-pressed={isSelected}
              onClick={() => {
                if (!canAdd) return;
                if (selectionMode) {
                  toggleSelected(photo.id);
                } else {
                  onSelect?.({ id: photo.id, asset_type: "image" });
                }
              }}
              onKeyDown={(e) => {
                if (!canAdd) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (selectionMode) {
                    toggleSelected(photo.id);
                  } else {
                    onSelect?.({ id: photo.id, asset_type: "image" });
                  }
                }
              }}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 8,
                border: isPicked || isSelected
                  ? "1.5px solid var(--gold)"
                  : "1px solid var(--line-soft)",
                boxShadow: isPicked || isSelected
                  ? "0 0 0 3px oklch(0.66 0.12 75 / 0.18)"
                  : undefined,
                padding: 0,
                cursor:
                  selectionMode && canAdd
                    ? "pointer"
                    : canAdd
                      ? "grab"
                      : "default",
                opacity: isDragging ? 0.4 : 1,
                transition:
                  "opacity .15s var(--ease), border-color .15s var(--ease), box-shadow .15s var(--ease)",
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

            {selectionMode && canAdd && (
              <div
                className={cn(
                  "absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md border backdrop-blur",
                  isPicked
                    ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--on-gold)]"
                    : "border-white/50 bg-black/35 text-white",
                )}
                aria-hidden="true"
              >
                {isPicked && <Check size={15} strokeWidth={3} />}
              </div>
            )}

            {canAdd && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  addOne(photo);
                }}
                className={cn(
                  "absolute bottom-2 right-2 z-30 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5",
                  "bg-[var(--gold)] text-[var(--on-gold)] shadow-[var(--shadow-gold)]",
                  "text-xs font-medium opacity-100 transition-colors duration-150 hover:bg-[var(--gold-hi)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                  "sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                )}
                aria-label="Add this photo to creator"
                title="Add to Creator"
              >
                <Plus size={13} />
                Add
              </button>
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
          );
        })}
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
