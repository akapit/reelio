"use client";

import { Image as ImageIcon } from "lucide-react";
import { useAssets } from "@/hooks/use-assets";

interface PhotosTabProps {
  projectId: string;
}

export function PhotosTab({ projectId }: PhotosTabProps) {
  const { data: assets } = useAssets(projectId);

  const photos = (assets ?? []).filter((a) => a.asset_type === "image");

  if (photos.length === 0) {
    return (
      <div className="text-center py-16" dir="rtl">
        <ImageIcon className="w-16 h-16 mx-auto text-stone-300 mb-4" />
        <p className="text-slate-500 text-sm">
          עדיין אין תמונות — העלה תמונות מתיבת היצירה למעלה
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4"
      dir="rtl"
    >
      {photos.map((photo) => {
        const thumbnailUrl =
          (photo as { thumbnail_url?: string | null }).thumbnail_url ??
          photo.original_url ??
          undefined;

        return (
          <div
            key={photo.id}
            className="aspect-square bg-stone-100 rounded-lg overflow-hidden relative group"
          >
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt=""
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-100">
                <ImageIcon className="w-8 h-8 text-stone-300" />
              </div>
            )}

            {photo.status === "processing" && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {photo.status === "failed" && (
              <span className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">
                נכשל
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
