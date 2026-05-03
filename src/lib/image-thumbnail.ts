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

export interface ThumbnailResult {
  /** Resized JPEG/WebP suitable for upload as the thumbnail. */
  blob: Blob;
  /** Source image's intrinsic pixel width — taken from the decoded bitmap so
   *  callers can persist `metadata.dimensions` without decoding twice. */
  sourceWidth: number;
  /** Source image's intrinsic pixel height. */
  sourceHeight: number;
}

/**
 * Generate a thumbnail blob from an image source. Works on any browser-decodable
 * image (jpeg/png/webp/gif/heic where the browser supports it). Throws if the
 * source can't be decoded.
 *
 * Also returns the source image's intrinsic width/height — already known from
 * the `createImageBitmap` decode, surfaced so the upload hook can persist
 * dimensions in the asset row without a second decode.
 */
export async function generateThumbnail(
  source: Blob,
  opts: ThumbnailOptions = {},
): Promise<ThumbnailResult> {
  const { maxEdge, quality, mimeType } = { ...DEFAULTS, ...opts };

  const bitmap = await createImageBitmap(source);
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const { w, h } = targetSize(sourceWidth, sourceHeight, maxEdge);

  // Prefer OffscreenCanvas when available; fall back to a detached <canvas>.
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: mimeType, quality });
    return { blob, sourceWidth, sourceHeight };
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mimeType,
      quality,
    );
  });
  return { blob, sourceWidth, sourceHeight };
}
