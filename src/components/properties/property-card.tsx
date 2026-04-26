"use client";

import Link from "next/link";
import { Image as ImageIcon, Video } from "lucide-react";

interface PropertyCardProps {
  id: string;
  address: string;
  rooms?: string;
  size?: string;
  price?: string;
  photoCount: number;
  videoCount: number;
  thumbnailUrl?: string;
}

export function PropertyCard({
  id,
  address,
  rooms,
  size,
  price,
  photoCount,
  videoCount,
  thumbnailUrl,
}: PropertyCardProps) {
  return (
    <Link
      href={`/dashboard/properties/${id}`}
      className="bg-white rounded-xl overflow-hidden shadow-md border border-stone-200 hover:shadow-xl hover:border-amber-300 transition-all text-right group block"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-gradient-to-br from-slate-100 to-stone-100 flex items-center justify-center relative overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={address}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon className="w-16 h-16 text-stone-300 group-hover:text-amber-400 transition-colors" />
        )}

        {/* Pills */}
        <div className="absolute top-3 right-3 flex gap-2">
          <span className="bg-white/90 backdrop-blur px-2.5 py-1 rounded-full text-xs font-medium text-slate-700 flex items-center gap-1">
            <ImageIcon className="w-3.5 h-3.5" />
            {photoCount}
          </span>
          <span className="bg-white/90 backdrop-blur px-2.5 py-1 rounded-full text-xs font-medium text-slate-700 flex items-center gap-1">
            <Video className="w-3.5 h-3.5" />
            {videoCount}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-5">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{address}</h3>
        <div className="space-y-1.5 text-sm text-slate-600">
          {rooms && <p>{rooms}</p>}
          {size && <p>{size}</p>}
          {price && <p className="text-amber-700 font-semibold">{price}</p>}
        </div>
      </div>
    </Link>
  );
}
