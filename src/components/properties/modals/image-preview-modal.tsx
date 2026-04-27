"use client";

import { useEffect, useState } from "react";
import { X as XIcon, Maximize2, Minimize2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

interface ImagePreviewModalProps {
  open: boolean;
  imageUrl: string | null;
  alt?: string;
  onClose: () => void;
}

export function ImagePreviewModal({
  open,
  imageUrl,
  alt,
  onClose,
}: ImagePreviewModalProps) {
  const { t } = useI18n();
  const [fullSize, setFullSize] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleClose = () => {
    setFullSize(false);
    onClose();
  };

  if (!open || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 md:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t.photos.preview}
    >
      {/* Top-trailing action buttons */}
      <div className="absolute end-4 top-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFullSize((v) => !v)}
          aria-label={fullSize ? t.common.close : t.photos.preview}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/25"
        >
          {fullSize ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          aria-label={t.common.close}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/25"
        >
          <XIcon size={18} />
        </button>
      </div>

      {fullSize ? (
        <div
          className="h-full w-full overflow-auto"
          style={{ maxHeight: "100vh", maxWidth: "100vw" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={alt ?? "Photo"}
            style={{
              display: "block",
              width: "auto",
              maxWidth: "none",
              height: "auto",
            }}
          />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={alt ?? "Photo"}
          className="max-h-[92vh] max-w-[96vw] rounded-lg object-contain shadow-2xl"
          draggable={false}
        />
      )}
    </div>
  );
}
