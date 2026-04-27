import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRoomType } from "@/lib/rooms";

/**
 * POST /api/assets/room-type
 * Body: { assetId: string, roomType: RoomType }
 *
 * Updates `assets.metadata.roomType`. Deep-merges the existing metadata
 * object so we don't clobber other keys (externalIds, generation config,
 * lastError, etc.).
 */
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
  const { assetId, roomType } = body as {
    assetId?: unknown;
    roomType?: unknown;
  };
  if (typeof assetId !== "string" || !assetId) {
    return NextResponse.json({ error: "assetId required" }, { status: 400 });
  }
  if (!isRoomType(roomType)) {
    return NextResponse.json({ error: "invalid roomType" }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("assets")
    .select("id, user_id, metadata")
    .eq("id", assetId)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prevMetadata =
    existing.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const nextMetadata = { ...prevMetadata, roomType };

  const { error: updateErr } = await supabase
    .from("assets")
    .update({ metadata: nextMetadata })
    .eq("id", assetId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, roomType });
}
