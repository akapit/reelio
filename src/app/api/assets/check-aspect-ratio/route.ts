import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  aspectRatiosConflict,
  type AspectRatioLabel,
} from "@/lib/aspect-ratio";
import { ensureAssetDimensions } from "@/lib/asset-dimensions";

/**
 * Pre-flight aspect-ratio check, called by `CreationBar` right before kicking
 * off a video generation. Compares each selected source image's bucket against
 * the template's target output AR and returns the mismatched assets so the UI
 * can show a confirm modal.
 *
 * Lazy backfill: assets uploaded before the upload-time tagging shipped don't
 * have `metadata.dimensions`. `ensureAssetDimensions` fetches the image from
 * R2, runs sharp, and persists the result back so subsequent calls are fast.
 */
const BodySchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(40),
  targetAspectRatio: z.enum(["16:9", "9:16", "1:1"]),
});

interface MismatchEntry {
  assetId: string;
  sourceLabel: AspectRatioLabel;
  sourceRatio: number;
  thumbnailUrl: string | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { assetIds, targetAspectRatio } = parsed.data;

  // RLS scopes to user_id automatically; the .eq is defense-in-depth.
  const { data: rows, error } = await supabase
    .from("assets")
    .select("id, original_url, thumbnail_url, metadata")
    .in("id", assetIds)
    .eq("user_id", user.id)
    .eq("asset_type", "image");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mismatches: MismatchEntry[] = [];
  // Sequential rather than parallel: backfill writes happen on misses, and
  // hammering R2 with a parallel fetch storm for a 20-image selection isn't
  // worth the saved seconds. Most assets hit the fast path (stored dims).
  for (const row of rows ?? []) {
    const dims = await ensureAssetDimensions(supabase, {
      id: row.id as string,
      original_url: (row.original_url as string | null) ?? null,
      metadata:
        (row.metadata as Record<string, unknown> | null) ?? null,
    });
    if (!dims) continue; // Couldn't determine — fail open, no warning.
    if (aspectRatiosConflict(dims.label, targetAspectRatio)) {
      mismatches.push({
        assetId: row.id as string,
        sourceLabel: dims.label,
        sourceRatio: dims.aspectRatio,
        thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
      });
    }
  }

  return NextResponse.json({ mismatches });
}
