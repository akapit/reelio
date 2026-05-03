/**
 * Server-side lazy backfill for asset dimensions / aspect-ratio bucket.
 *
 * New uploads tag `metadata.dimensions` at insert time (see `use-upload.ts`).
 * Assets created before that change ship with an empty metadata object, so the
 * pre-flight AR-mismatch check can't compare them. This helper:
 *
 *   1. Reads `metadata.dimensions` from the asset row.
 *   2. If absent, fetches the original image from R2, runs `sharp().metadata()`
 *      to read width/height (no full decode — sharp parses the header), buckets
 *      with `getAspectRatioLabel`, and persists the result back to the row via
 *      a one-level deep-merge on `metadata`.
 *   3. Returns the dimensions either way.
 *
 * Errors during fetch/decode are logged and surfaced as `null` so the caller
 * can decide whether to skip the warning or fail open.
 */
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAspectRatioLabel,
  type AspectRatioLabel,
} from "@/lib/aspect-ratio";

export interface StoredDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  label: AspectRatioLabel;
}

interface AssetRow {
  id: string;
  original_url: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Coerce a stored `metadata.dimensions` object back into a `StoredDimensions`,
 * tolerating older shapes that may pre-date the `label` field. Returns null
 * when the data is unusable (missing/zero dims, garbage types).
 */
function readStoredDimensions(
  metadata: Record<string, unknown> | null,
): StoredDimensions | null {
  const dims = (metadata?.dimensions ?? null) as
    | { width?: unknown; height?: unknown; label?: unknown }
    | null;
  if (!dims || typeof dims !== "object") return null;
  const width = typeof dims.width === "number" ? dims.width : null;
  const height = typeof dims.height === "number" ? dims.height : null;
  if (width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }
  const label =
    typeof dims.label === "string" &&
    (dims.label === "16:9" ||
      dims.label === "9:16" ||
      dims.label === "4:3" ||
      dims.label === "1:1")
      ? (dims.label as AspectRatioLabel)
      : getAspectRatioLabel(width, height);
  return {
    width,
    height,
    aspectRatio: width / height,
    label,
  };
}

/**
 * Read the image bytes from R2, parse the header with sharp to get
 * width/height, and return a `StoredDimensions`. Throws on fetch / parse
 * failure so callers can decide how loud to be.
 */
async function probeRemoteDimensions(
  originalUrl: string,
): Promise<StoredDimensions> {
  const res = await fetch(originalUrl);
  if (!res.ok) {
    throw new Error(`fetch ${res.status} for ${originalUrl}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(bytes).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h || w <= 0 || h <= 0) {
    throw new Error(
      `sharp could not determine dimensions (w=${w}, h=${h}) for ${originalUrl}`,
    );
  }
  return {
    width: w,
    height: h,
    aspectRatio: w / h,
    label: getAspectRatioLabel(w, h),
  };
}

/**
 * One-level deep-merge update on `metadata`. Mirrors the trigger-side
 * `appendAssetMetadata` so concurrent writes under different top-level keys
 * (e.g. `externalIds` from a generation, `dimensions` from this backfill)
 * don't clobber each other.
 */
async function persistDimensions(
  supabase: SupabaseClient,
  asset: AssetRow,
  dims: StoredDimensions,
): Promise<void> {
  const current = asset.metadata ?? {};
  const merged: Record<string, unknown> = { ...current, dimensions: dims };
  const { error } = await supabase
    .from("assets")
    .update({ metadata: merged })
    .eq("id", asset.id);
  if (error) {
    console.warn(
      "[asset-dimensions] failed to persist backfilled dimensions",
      asset.id,
      error.message,
    );
  }
}

/**
 * Get an asset's `StoredDimensions`, backfilling from the original image when
 * the row's metadata is missing/incomplete. Returns null when both the stored
 * value is absent AND probing the remote image fails — caller should treat
 * "unknown AR" as "no warning" rather than blocking the user on a network blip.
 */
export async function ensureAssetDimensions(
  supabase: SupabaseClient,
  asset: AssetRow,
): Promise<StoredDimensions | null> {
  const stored = readStoredDimensions(asset.metadata);
  if (stored) return stored;
  if (!asset.original_url) return null;
  try {
    const probed = await probeRemoteDimensions(asset.original_url);
    await persistDimensions(supabase, asset, probed);
    return probed;
  } catch (err) {
    console.warn(
      "[asset-dimensions] backfill failed for",
      asset.id,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
