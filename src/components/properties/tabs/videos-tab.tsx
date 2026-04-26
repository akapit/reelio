"use client";

import { Video, Image as ImageIcon, Share2 } from "lucide-react";
import { useAssets } from "@/hooks/use-assets";

interface VideosTabProps {
  projectId: string;
}

export function VideosTab({ projectId }: VideosTabProps) {
  const { data: assets } = useAssets(projectId);

  const videos = (assets ?? []).filter((a) => a.asset_type === "video");

  if (videos.length === 0) {
    return (
      <div className="text-center py-16" dir="rtl">
        <Video className="w-16 h-16 mx-auto text-stone-300 mb-4" />
        <p className="text-slate-500 text-sm">
          עדיין אין סרטונים — עבור לטאב &quot;תמונות&quot; כדי ליצור סרטון
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4"
      dir="rtl"
    >
      {videos.map((video) => {
        const meta = video.metadata as
          | { referenceAssetIds?: string[]; videoModel?: string; prompt?: string }
          | null
          | undefined;
        const sourceCount = meta?.referenceAssetIds?.length ?? 0;
        const thumbnailUrl =
          (video as { thumbnail_url?: string | null }).thumbnail_url ?? null;

        return (
          <div
            key={video.id}
            className="relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-200 border border-stone-200 group"
          >
            {/* Full-bleed thumbnail / preview */}
            {video.status === "done" && video.original_url ? (
              thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <video
                  src={video.original_url}
                  className="absolute inset-0 w-full h-full object-cover"
                  preload="metadata"
                />
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                {video.status === "processing" ? (
                  <div className="w-7 h-7 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Video className="w-10 h-10 text-slate-400" />
                )}
              </div>
            )}

            {/* Status badge */}
            {video.status === "done" && (
              <span className="absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full shadow">
                הושלם
              </span>
            )}
            {video.status === "processing" && (
              <span className="absolute top-2 right-2 bg-amber-600 text-white text-xs px-2 py-0.5 rounded-full shadow">
                בעיבוד
              </span>
            )}
            {video.status === "failed" && (
              <span className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full shadow">
                נכשל
              </span>
            )}

            {/* Bottom action row — source count + share, both as compact icon buttons */}
            <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
              {sourceCount > 0 ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/55 backdrop-blur text-white text-xs font-medium"
                  title={`${sourceCount} תמונות מקור`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  {sourceCount}
                </span>
              ) : (
                <span />
              )}

              <button
                type="button"
                onClick={() => console.log("TODO: share video", video.id)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/90 backdrop-blur text-slate-700 hover:bg-white hover:text-amber-700 transition-colors shadow"
                aria-label="שתף"
                title="שתף"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
