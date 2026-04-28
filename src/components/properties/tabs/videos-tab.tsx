"use client";

import { Video, Image as ImageIcon, Share2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SelectableAsset } from "@/components/properties/property-detail";
import { useI18n } from "@/lib/i18n/client";

interface VideoTabAsset {
  id: string;
  asset_type: string;
  status: string;
  original_url?: string | null;
  processed_url?: string | null;
  thumbnail_url?: string | null;
  metadata?: unknown;
}

interface VideosTabProps {
  assets?: VideoTabAsset[];
  /** Id of the asset currently shown in the parent preview pane. */
  selectedAssetId?: string | null;
  /** Click handler — parent swaps the preview to this video and autoplays. */
  onSelect?: (asset: SelectableAsset) => void;
  /** Deletes this asset row from the project. */
  onDelete?: (assetId: string) => void;
}

const STATUS_MAP = {
  done: { labelKey: "published", color: "var(--positive)" },
  processing: { labelKey: "rendering", color: "var(--gold-hi)" },
  failed: { labelKey: "failed", color: "oklch(0.65 0.20 25)" },
} as const;

export function VideosTab({
  assets = [],
  selectedAssetId,
  onSelect,
  onDelete,
}: VideosTabProps) {
  const { t } = useI18n();
  const videos = assets.filter((a) => a.asset_type === "video");

  if (videos.length === 0) {
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
          <Video size={22} style={{ color: "var(--gold-hi)" }} />
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
          {t.videos.empty}
        </p>
        <p
          className="kicker"
          style={{ color: "var(--fg-3)", margin: 0 }}
        >
          {t.videos.emptyHint}
        </p>
      </div>
    );
  }

  return (
    <div className="videos-tab-grid">
      <style>{`
        .videos-tab-grid {
          --videos-grid-gap: 12px;
          --videos-grid-cap: 5;
          --videos-grid-max: 1024px;
          display: grid;
          grid-template-columns: repeat(
            auto-fill,
            minmax(
              max(130px, calc((100% - (var(--videos-grid-cap) - 1) * var(--videos-grid-gap)) / var(--videos-grid-cap))),
              1fr
            )
          );
          gap: var(--videos-grid-gap);
          width: 100%;
          max-width: var(--videos-grid-max);
          margin-inline: auto;
        }
        @media (max-width: 640px) {
          .videos-tab-grid {
            --videos-grid-gap: 8px;
            --videos-grid-cap: 3;
            grid-template-columns: repeat(
              auto-fill,
              minmax(
                max(110px, calc((100% - (var(--videos-grid-cap) - 1) * var(--videos-grid-gap)) / var(--videos-grid-cap))),
                1fr
              )
            );
          }
        }
      `}</style>
      {videos.map((video) => {
        const meta = video.metadata as
          | {
              referenceAssetIds?: string[];
              videoModel?: string;
              prompt?: string;
            }
          | null
          | undefined;
        const sourceCount = meta?.referenceAssetIds?.length ?? 0;
        const thumbnailUrl =
          (video as { thumbnail_url?: string | null }).thumbnail_url ?? null;
        const statusKey = (
          video.status === "done"
            ? "done"
            : video.status === "processing"
              ? "processing"
              : video.status === "failed"
                ? "failed"
                : null
        ) as keyof typeof STATUS_MAP | null;
        const statusInfo = statusKey ? STATUS_MAP[statusKey] : null;
        const isSelected = selectedAssetId === video.id;
        const playableUrl = video.processed_url ?? video.original_url ?? "";
        const canSelect = video.status === "done" && !!playableUrl;

        return (
          <div
            key={video.id}
            className={cn("prop-img group relative")}
            data-tone="warm"
            style={{
              aspectRatio: "3 / 4",
              borderRadius: 12,
              border: isSelected
                ? "1.5px solid var(--gold)"
                : "1px solid var(--line-soft)",
              boxShadow: isSelected
                ? "0 0 0 3px var(--gold-tint-2)"
                : undefined,
              position: "relative",
              overflow: "hidden",
              transition:
                "border-color .15s var(--ease), box-shadow .15s var(--ease)",
            }}
          >
            {/* Click target sits above the thumbnail so the user can pick the
                video to play in the hero. The bottom action row (share button)
                lives outside this layer so its click doesn't bubble through. */}
            <button
              type="button"
              onClick={() =>
                canSelect &&
                onSelect?.({ id: video.id, asset_type: "video" })
              }
              disabled={!canSelect}
              aria-label={isSelected ? t.videos.selected : t.videos.playThis}
              aria-pressed={isSelected}
              className="absolute inset-0 z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
              style={{
                background: "transparent",
                border: 0,
                padding: 0,
                cursor: canSelect ? "pointer" : "default",
              }}
            />

            {video.status === "done" && playableUrl ? (
              thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailUrl}
                  alt={t.videos.generatedThumbnail}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <video
                  src={playableUrl}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  preload="metadata"
                />
              )
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
                {video.status === "processing" ? (
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      border: "2px solid var(--gold-hi)",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                ) : (
                  <Video size={32} />
                )}
              </div>
            )}

            {/* Status pill */}
            {statusInfo && (
              <span
                className="mono"
                style={{
                  position: "absolute",
                  top: 8,
                  insetInlineStart: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: statusInfo.color,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "oklch(0.10 0.01 70 / 0.55)",
                  backdropFilter: "blur(4px)",
                  zIndex: 2,
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 999,
                    background: statusInfo.color,
                    animation:
                      video.status === "processing"
                        ? "pulse-dot 1.4s ease-in-out infinite"
                        : "none",
                  }}
                />
                {t.status[statusInfo.labelKey]}
              </span>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(video.id);
                }}
                style={{
                  position: "absolute",
                  top: 8,
                  insetInlineEnd: 8,
                  zIndex: 3,
                }}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  "border border-white/45 bg-black/45 text-white shadow-sm backdrop-blur",
                  "opacity-100 transition-colors duration-150 hover:border-red-300/80 hover:bg-red-500/90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300",
                  "sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                )}
                aria-label={t.videos.deleteVideo}
                title={t.common.delete}
              >
                <Trash2 size={14} />
              </button>
            )}

            {/* Bottom action row — sits above the click overlay */}
            <div
              style={{
                position: "absolute",
                insetInlineStart: 8,
                insetInlineEnd: 8,
                bottom: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
                zIndex: 2,
              }}
            >
              {sourceCount > 0 ? (
                <span
                  className="mono"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    padding: "3px 7px",
                    borderRadius: 999,
                    background: "oklch(0.10 0.01 70 / 0.55)",
                    backdropFilter: "blur(4px)",
                    color: "oklch(0.95 0.02 80 / 0.92)",
                    pointerEvents: "none",
                  }}
                  title={`${sourceCount} ${t.videos.sourceImages}`}
                >
                  <ImageIcon size={11} />
                  {sourceCount}
                </span>
              ) : (
                <span />
              )}

              <button
                type="button"
                onClick={(e) => {
                  // Don't bubble to the click overlay underneath — share is
                  // its own action.
                  e.stopPropagation();
                  console.log("TODO: share video", video.id);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  background: "oklch(0.95 0.02 80 / 0.92)",
                  backdropFilter: "blur(4px)",
                  color: "var(--fg-1)",
                  border: 0,
                  cursor: "pointer",
                  transition:
                    "background-color .15s var(--ease), color .15s var(--ease), transform .15s var(--ease)",
                }}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
                aria-label={t.common.share}
                title={t.common.share}
              >
                <Share2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
