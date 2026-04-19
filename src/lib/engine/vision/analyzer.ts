import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import {
  ImageDataset,
  type ImageMetadata,
  type RoomType,
  type VisionLabel,
  type VisionObject,
} from "../models";
import { googleVision, type VisionProvider, type VisionRaw } from "./googleVision";
import { classifyRoom } from "./roomClassifier";
import { checkImageQuality } from "./qualityCheck";
import { gcvCost } from "../cost/pricing";

export class VisionApiError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "VisionApiError";
    this.cause = cause;
  }
}

export interface AnalyzeCostSummary {
  /** GCV cost for all images successfully annotated. */
  gcvUsd: number;
  /** Claude VLM quality-check cost for this run (0 if no QC fired). */
  qualityCheckUsd: number;
  totalUsd: number;
  /** Raw token metadata for the QC call, for inspector drill-down. */
  qcTokens?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}

export interface AnalyzeDeps {
  provider?: VisionProvider;
  loadBytes?: (path: string) => Promise<Buffer>;
  /** Optional sink for cost telemetry — callers that record to engine_steps
   *  metrics pass a closure; test callers / the legacy pipeline ignore it. */
  onCost?: (cost: AnalyzeCostSummary) => void;
}

async function defaultLoadBytes(path: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(path)) {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`fetch ${path} -> ${res.status}`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }
  return readFile(path);
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const hex = (n: number) => clamp(n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

function extractDominantColors(raw: VisionRaw): string[] {
  const colors = raw.imagePropertiesAnnotation?.dominantColors?.colors ?? [];
  return [...colors]
    .sort((a, b) => (b.pixelFraction ?? b.score ?? 0) - (a.pixelFraction ?? a.score ?? 0))
    .slice(0, 3)
    .map((c) => toHex(c.color?.red ?? 0, c.color?.green ?? 0, c.color?.blue ?? 0));
}

function topLabels(raw: VisionRaw): VisionLabel[] {
  return [...raw.labelAnnotations]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((l) => ({ name: l.description, confidence: l.score }));
}

/** Metadata for an image that failed GCV entirely. We still include it in the
 *  dataset as unusable so the UI can surface the error. */
function failedImage(path: string, reason: string): ImageMetadata {
  return {
    path,
    roomType: "other",
    usable: false,
    reason,
    dims: { width: 1, height: 1, aspectRatio: 1 },
    visionLabels: [],
    visionObjects: [],
    dominantColorsHex: [],
  };
}

function toMetadata(path: string, raw: VisionRaw): ImageMetadata {
  const labels: VisionLabel[] = raw.labelAnnotations.map((l) => ({
    name: l.description.toLowerCase(),
    confidence: l.score,
  }));
  const objects: VisionLabel[] = raw.localizedObjectAnnotations.map((o) => ({
    name: o.name.toLowerCase(),
    confidence: o.score,
  }));
  // Full localized-object list WITH bboxes (used by smartCrop downstream).
  // Images without a bbox (rare) are dropped here — smartCrop falls back to
  // centered crop when the list is empty.
  const visionObjects: VisionObject[] = raw.localizedObjectAnnotations
    .filter(
      (o): o is typeof o & { bbox: { x0: number; y0: number; x1: number; y1: number } } =>
        o.bbox !== undefined,
    )
    .map((o) => ({
      name: o.name.toLowerCase(),
      confidence: o.score,
      bbox: o.bbox,
    }));
  const roomType: RoomType = classifyRoom(labels, objects);

  const width = raw.width > 0 ? raw.width : 1;
  const height = raw.height > 0 ? raw.height : 1;

  // Default to usable; the Claude VLM pass overrides this per image in
  // `analyzeImages`. If the QC call fails we leave `usable=true` so infra
  // blips don't block generation.
  return {
    path,
    roomType,
    usable: true,
    dims: {
      width,
      height,
      aspectRatio: width / height,
    },
    visionLabels: topLabels(raw),
    visionObjects,
    dominantColorsHex: extractDominantColors(raw),
  };
}

async function tryLoadCachedDataset(): Promise<ImageDataset | null> {
  const cacheDir = process.env.ENGINE_CACHE_DIR;
  if (!cacheDir) return null;
  const cachePath = path.join(cacheDir, "dataset.json");
  try {
    await access(cachePath);
    const raw = JSON.parse(await readFile(cachePath, "utf-8"));
    const parsed = ImageDataset.safeParse(raw);
    if (parsed.success) {
      console.log(JSON.stringify({ source: "vision", event: "dataset.cacheHit", path: cachePath }));
      return parsed.data;
    }
  } catch {
    // No cache or invalid — fall through to full analysis.
  }
  return null;
}

async function saveCachedDataset(dataset: ImageDataset): Promise<void> {
  const cacheDir = process.env.ENGINE_CACHE_DIR;
  if (!cacheDir) return;
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(path.join(cacheDir, "dataset.json"), JSON.stringify(dataset, null, 2));
  } catch {
    // Best-effort — don't break the pipeline over a cache write.
  }
}

export async function analyzeImages(
  paths: string[],
  deps: AnalyzeDeps = {},
): Promise<ImageDataset> {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new VisionApiError("analyzeImages: no paths provided");
  }

  const cached = await tryLoadCachedDataset();
  if (cached) return cached;

  const provider = deps.provider ?? googleVision;
  const loadBytes = deps.loadBytes ?? defaultLoadBytes;
  const limit = pLimit(5);

  // Step 1: GCV per image in parallel (produces roomType + bboxes + dims).
  //         Keep the raw bytes around so we can hand them to Claude for QC
  //         without loading the image twice.
  const results = await Promise.all(
    paths.map((path) =>
      limit(async (): Promise<{
        path: string;
        meta: ImageMetadata;
        bytes: Buffer | null;
        ok: boolean;
      }> => {
        try {
          const bytes = await loadBytes(path);
          const raw = await provider.annotate(bytes);
          return { path, meta: toMetadata(path, raw), bytes, ok: true };
        } catch (err) {
          console.log(
            JSON.stringify({
              source: "vision",
              event: "analyzeImageFailed",
              path,
              message: err instanceof Error ? err.message : String(err),
            }),
          );
          return {
            path,
            meta: failedImage(
              path,
              err instanceof Error ? err.message : "vision failed",
            ),
            bytes: null,
            ok: false,
          };
        }
      }),
    ),
  );

  const anyOk = results.some((r) => r.ok);
  if (!anyOk) {
    throw new VisionApiError(
      `analyzeImages: all ${paths.length} image(s) failed to analyze`,
    );
  }

  // Step 2: Batched Claude VLM quality pass on the images that survived GCV.
  //         Overlay `usable`/`reason` onto each image's metadata.
  const qcInput = results
    .filter((r): r is typeof r & { bytes: Buffer } => r.ok && r.bytes !== null)
    .map((r) => ({ path: r.path, bytes: r.bytes }));

  let qcFallback = false;
  let qualityCheckUsd = 0;
  let qcTokens: AnalyzeCostSummary["qcTokens"];
  if (qcInput.length > 0) {
    try {
      const qc = await checkImageQuality({ images: qcInput });
      qcFallback = qc.fallbackUsed;
      qualityCheckUsd = qc.costUsd;
      qcTokens = {
        inputTokens: qc.tokensIn,
        outputTokens: qc.tokensOut,
        cacheReadTokens: qc.cacheReadTokens,
        cacheWriteTokens: qc.cacheWriteTokens,
      };
      for (const r of results) {
        const v = qc.verdicts.get(r.path);
        if (v && r.ok) {
          r.meta = { ...r.meta, usable: v.usable, reason: v.reason };
        }
      }
      console.log(
        JSON.stringify({
          source: "vision",
          event: "qualityCheck.ok",
          inputCount: qcInput.length,
          unusableCount: Array.from(qc.verdicts.values()).filter(
            (v) => !v.usable,
          ).length,
          fallbackUsed: qc.fallbackUsed,
          tokensIn: qc.tokensIn,
          tokensOut: qc.tokensOut,
          cacheReadTokens: qc.cacheReadTokens,
          costUsd: qc.costUsd,
        }),
      );
    } catch (err) {
      // Fallback: treat everything as usable. Never block a run on a QC infra
      // blip — an unusable photo in a video is recoverable, but a dead run is
      // not.
      qcFallback = true;
      console.log(
        JSON.stringify({
          source: "vision",
          event: "qualityCheck.failed",
          level: "warn",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  // Emit cost telemetry to the caller. GCV is priced per successful GCV
  // annotation; failed ones aren't billed.
  if (deps.onCost) {
    const gcvUsd = gcvCost(results.filter((r) => r.ok).length);
    deps.onCost({
      gcvUsd,
      qualityCheckUsd,
      totalUsd: gcvUsd + qualityCheckUsd,
      qcTokens,
    });
  }

  const images = results.map((r) => r.meta);
  const usableCount = images.filter((m) => m.usable).length;
  const availableRoomTypes = Array.from(
    new Set(images.filter((m) => m.usable).map((m) => m.roomType)),
  ) as RoomType[];

  const dataset = ImageDataset.parse({
    images,
    availableRoomTypes,
    usableCount,
    analyzedAt: new Date().toISOString(),
  });
  // Quality-check-fallback state is a transient warning; we don't surface it
  // through the schema today. Logged above, visible in Trigger.dev output.
  void qcFallback;
  await saveCachedDataset(dataset);
  return dataset;
}
