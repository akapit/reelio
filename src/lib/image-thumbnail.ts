/**
 * Client-side thumbnail generator.
 *
 * Resizes an image (File / Blob / fetched bytes) to a small JPEG suitable for
 * the asset library grid. Runs in the browser via createImageBitmap +
 * OffscreenCanvas (or a fallback HTMLCanvasElement) — no server round-trip,
 * no native deps, no extra costs.
 *
 * Used at upload time (see `useUpload`) and by the missing-thumbnail backfill
 * loop in the photos tab.
 */

export interface ThumbnailOptions {
  /** Longest edge in CSS pixels. Default 480 — comfortable for the 5-col grid at 2x DPR. */
  maxEdge?: number;
  /** JPEG quality 0..1. Default 0.78. */
  quality?: number;
  /** MIME type of the output. Default "image/jpeg". */
  mimeType?: "image/jpeg" | "image/webp";
}

const DEFAULTS: Required<ThumbnailOptions> = {
  maxEdge: 480,
  quality: 0.78,
  mimeType: "image/jpeg",
};

function targetSize(
  srcW: number,
  srcH: number,
  maxEdge: number,
): { w: number; h: number } {
  if (srcW <= maxEdge && srcH <= maxEdge) return { w: srcW, h: srcH };
  const scale = srcW >= srcH ? maxEdge / srcW : maxEdge / srcH;
  return {
    w: Math.max(1, Math.round(srcW * scale)),
    h: Math.max(1, Math.round(srcH * scale)),
  };
}

/**
 * Generate a thumbnail blob from an image source. Works on any browser-decodable
 * image (jpeg/png/webp/gif/heic where the browser supports it). Throws if the
 * source can't be decoded.
 */
export async function generateThumbnail(
  source: Blob,
  opts: ThumbnailOptions = {},
): Promise<Blob> {
  const { maxEdge, quality, mimeType } = { ...DEFAULTS, ...opts };

  const bitmap = await createImageBitmap(source);
  const { w, h } = targetSize(bitmap.width, bitmap.height, maxEdge);

  // Prefer OffscreenCanvas when available; fall back to a detached <canvas>.
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await canvas.convertToBlob({ type: mimeType, quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mimeType,
      quality,
    );
  });
}
