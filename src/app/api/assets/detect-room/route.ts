import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { ROOM_TYPES, isRoomType, type RoomType } from "@/lib/rooms";
import { buildAnthropicImageContent } from "@/lib/engine/llm/anthropicImage";
import { isLogoAsset } from "@/lib/video-logo";

const MAX_PER_REQUEST = 12;
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a real-estate photo classifier.

Look at the image and decide which single room type best describes the dominant interior space (or "exterior" if it is shot outdoors).

You must reply with ONLY one of the following lowercase tokens, with no extra text, punctuation, or explanation:
${ROOM_TYPES.join(", ")}

If the image is ambiguous or shows none of these clearly, reply "other".`;

interface AssetRow {
  id: string;
  thumbnail_url: string | null;
  original_url: string | null;
  metadata: Record<string, unknown> | null;
}

function pickClassifierUrl(asset: AssetRow): string | null {
  // Prefer the small thumbnail if available — it costs fewer image tokens.
  return asset.thumbnail_url ?? asset.original_url ?? null;
}

async function classify(
  client: Anthropic,
  imageUrl: string,
): Promise<RoomType | null> {
  const imageContent = await buildAnthropicImageContent(imageUrl);
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 16,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          imageContent as never,
          { type: "text", text: "Classify this room." },
        ],
      },
    ],
  });
  const block = resp.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;
  const token = block.text.trim().toLowerCase().replace(/[^a-z_]/g, "");
  return isRoomType(token) ? token : "other";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 },
    );
  }
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
  const { projectId, assetId } = body as {
    projectId?: unknown;
    assetId?: unknown;
  };

  let query = supabase
    .from("assets")
    .select("id, thumbnail_url, original_url, metadata")
    .eq("user_id", user.id)
    .eq("asset_type", "image")
    .limit(MAX_PER_REQUEST);

  if (typeof assetId === "string" && assetId) {
    query = query.eq("id", assetId);
  } else if (typeof projectId === "string" && projectId) {
    query = query.eq("project_id", projectId);
  } else {
    return NextResponse.json(
      { error: "projectId or assetId required" },
      { status: 400 },
    );
  }

  const { data: rows, error: fetchErr } = await query;
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  const targets = (rows ?? []).filter((row) => {
    if (isLogoAsset(row)) return false;
    const meta = (row.metadata as Record<string, unknown> | null) ?? null;
    const existing = meta?.roomType;
    return !existing && pickClassifierUrl(row);
  });
  if (targets.length === 0) {
    return NextResponse.json({ success: true, processed: 0, results: [] });
  }

  const client = new Anthropic({ apiKey });
  const results: Array<{ id: string; roomType: RoomType | null }> = [];

  // Sequential — keeps the cost predictable and avoids hammering the API
  // on a backfill of dozens of images. Frontend will call again until done.
  for (const row of targets) {
    const url = pickClassifierUrl(row);
    if (!url) continue;
    let roomType: RoomType | null = null;
    try {
      roomType = await classify(client, url);
    } catch (err) {
      console.warn("[detect-room] classify failed", row.id, err);
      continue;
    }
    if (!roomType) continue;
    const prev =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    const next = { ...prev, roomType };
    const { error: updateErr } = await supabase
      .from("assets")
      .update({ metadata: next })
      .eq("id", row.id);
    if (updateErr) {
      console.warn("[detect-room] update failed", row.id, updateErr);
      continue;
    }
    results.push({ id: row.id, roomType });
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}
