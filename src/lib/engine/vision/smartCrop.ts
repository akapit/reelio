/**
 * Smart-crop preprocessing.
 *
 * Google Vision localized-object bounding boxes drive a center-on-subject
 * crop of each source image to the target aspect ratio before we hand it off
 * to the video provider. Without this, a 4:3 listing photo rendered to a 9:16
 * reel gets center-cropped by the provider (or worse, stretched), and the
 * subject (living room, exterior, hero shot) gets pushed to the edges.
 *
 * Contract:
 *   - Pure: no network, no R2.
 *   - `computeCropRect` is side-effect-free (unit-testable).
 *   - `applyCrop` shells out to ffmpeg and writes to a scratch dir.
 *
 * Called by src/lib/engine/scene-generator/generator.ts before each provider
 * generateVideo call when target aspect ratio != source aspect ratio.
 */

import path from "node:path";
import { mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import { runFfmpeg } from "@/lib/engine/renderer/ffmpegRun";
import type { VisionObject } from "@/lib/engine/models";

/** AR delta below which we skip cropping entirely (source ≈ target already). */
const AR_NOOP_TOLERANCE = 0.05;

/**
 * Confidence floors for subject selection. We try "strong" first; if no object
 * clears it, drop to "weak". If still nothing, the caller gets a null bbox
 * and falls back to centered crop.
 */
const CONF_STRONG = 0.5;
const CONF_WEAK = 0.3;

export interface CropRect {
  /** Source-pixel crop rect, integers. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when the rect covers (near) the full source — caller can no-op. */
  noop: boolean;
  /** Why we landed on this rect — for logs. */
  reason:
    | "ar_matches"
    | "subject_strong"
    | "subject_weak"
    | "no_subject_centered"
    | "degenerate";
}

/**
 * Compute a pixel-aligned crop rect that fits the target aspect ratio and is
 * centered on the union of confident subject bboxes. Never returns a rect
 * larger than the source image.
 *
 * @param imageDims  Source dimensions in pixels.
 * @param objects    Localized objects with NORMALIZED bboxes (0..1).
 * @param targetAR   Target aspect ratio (width / height). e.g. 9/16 ≈ 0.5625.
 */
export function computeCropRect(
  imageDims: { width: number; height: number },
  objects: VisionObject[],
  targetAR: number,
): CropRect {
  const { width: W, height: H } = imageDims;

  // Guard degenerate inputs.
  if (W <= 0 || H <= 0 || !Number.isFinite(targetAR) || targetAR <= 0) {
    return { x: 0, y: 0, w: Math.max(1, W), h: Math.max(1, H), noop: true, reason: "degenerate" };
  }

  const sourceAR = W / H;
  const arDelta = Math.abs(sourceAR - targetAR) / targetAR;
  if (arDelta <= AR_NOOP_TOLERANCE) {
    return { x: 0, y: 0, w: W, h: H, noop: true, reason: "ar_matches" };
  }

  // Largest rect with target AR that fits inside the source.
  //   source wider than target  →  full height, narrow width
  //   source taller than target →  full width, short height
  let cropW: number;
  let cropH: number;
  if (sourceAR > targetAR) {
    cropH = H;
    cropW = Math.round(H * targetAR);
  } else {
    cropW = W;
    cropH = Math.round(W / targetAR);
  }
  // Clamp to avoid > source (rounding edge cases).
  cropW = Math.min(cropW, W);
  cropH = Math.min(cropH, H);

  // Pick subject-center (cx, cy) in pixels. Try strong confidence first.
  const subject =
    unionBboxCenter(objects, CONF_STRONG, W, H) ??
    unionBboxCenter(objects, CONF_WEAK, W, H);

  let reason: CropRect["reason"];
  let cx: number;
  let cy: number;
  if (!subject) {
    cx = W / 2;
    cy = H / 2;
    reason = "no_subject_centered";
  } else {
    cx = subject.cx;
    cy = subject.cy;
    reason = subject.sourcedFromStrong ? "subject_strong" : "subject_weak";
  }

  // Center the crop on (cx, cy), then clamp to fit inside the source.
  let x = Math.round(cx - cropW / 2);
  let y = Math.round(cy - cropH / 2);
  x = Math.max(0, Math.min(x, W - cropW));
  y = Math.max(0, Math.min(y, H - cropH));

  // Force all four values even so yuv420p/yuvj420p ffmpeg pipelines don't
  // auto-align the chroma grid and push y+h past the source height (which
  // throws "Invalid too big or non positive size for ... height 'N'").
  // Floor w/h first to guarantee we never exceed the source.
  cropW = cropW - (cropW % 2);
  cropH = cropH - (cropH % 2);
  x = x - (x % 2);
  y = y - (y % 2);
  // Re-clamp after rounding x/y down (safe: w/h already even, x/y only shrank).
  x = Math.max(0, Math.min(x, W - cropW));
  y = Math.max(0, Math.min(y, H - cropH));

  return { x, y, w: cropW, h: cropH, noop: false, reason };
}

interface SubjectCenter {
  cx: number;
  cy: number;
  sourcedFromStrong: boolean;
}

function unionBboxCenter(
  objects: VisionObject[],
  confFloor: number,
  W: number,
  H: number,
): SubjectCenter | null {
  const keep = objects.filter((o) => o.confidence >= confFloor);
  if (keep.length === 0) return null;

  // Union bbox (normalized).
  let x0 = 1,
    y0 = 1,
    x1 = 0,
    y1 = 0;
  for (const o of keep) {
    x0 = Math.min(x0, o.bbox.x0);
    y0 = Math.min(y0, o.bbox.y0);
    x1 = Math.max(x1, o.bbox.x1);
    y1 = Math.max(y1, o.bbox.y1);
  }
  const cxN = (x0 + x1) / 2;
  const cyN = (y0 + y1) / 2;

  return {
    cx: cxN * W,
    cy: cyN * H,
    sourcedFromStrong: confFloor >= CONF_STRONG,
  };
}

/**
 * Apply a crop rect to an on-disk image via ffmpeg and return the cropped
 * image path. If the rect is a no-op, returns the original path unchanged.
 *
 * Output lives in `scratchDir` with a filename derived from the source name
 * plus a rect hash, so repeat calls hit the same file and can be cached.
 */
export async function applyCrop(
  imagePath: string,
  rect: CropRect,
  scratchDir: string,
): Promise<string> {
  if (rect.noop) return imagePath;

  await mkdir(scratchDir, { recursive: true });

  const hash = createHash("md5")
    .update(`${rect.x}:${rect.y}:${rect.w}:${rect.h}`)
    .digest("hex")
    .slice(0, 10);
  const baseName = path.basename(imagePath, path.extname(imagePath));
  const ext = path.extname(imagePath) || ".jpg";
  const outPath = path.join(scratchDir, `${baseName}.crop_${hash}${ext}`);

  // ffmpeg crop filter: crop=W:H:X:Y (source-pixel units).
  const args = [
    "-y",
    "-i",
    imagePath,
    "-vf",
    `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y}`,
    "-frames:v",
    "1",
    // Preserve quality — the provider re-encodes anyway.
    "-q:v",
    "2",
    outPath,
  ];

  await runFfmpeg(args);
  return outPath;
}

/**
 * Convenience helper for tests and debugging: copy the source image into
 * the scratch dir without modification. Unused in production but handy when
 * writing fixtures that assume the crop-dir exists.
 */
export async function copyAsIs(
  imagePath: string,
  scratchDir: string,
): Promise<string> {
  await mkdir(scratchDir, { recursive: true });
  const outPath = path.join(scratchDir, path.basename(imagePath));
  await copyFile(imagePath, outPath);
  return outPath;
}
