import { NextResponse } from "next/server";
import { createClient, getUserSafe } from "@/lib/supabase/server";

const TEXT_FIELDS = [
  "full_name",
  "headline",
  "tagline",
  "avatar_url",
  "watermark_url",
  "instagram_handle",
  "tiktok_handle",
  "youtube_handle",
] as const;

type TextField = (typeof TEXT_FIELDS)[number];
type Patch = Partial<Record<TextField, string | null>>;

function normalize(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function PATCH(request: Request) {
  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Patch = {};
  for (const field of TEXT_FIELDS) {
    const value = normalize(raw[field]);
    if (value !== undefined) patch[field] = value;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
  }

  const supabase = await createClient();
  const auth = await getUserSafe(supabase);
  if (auth.kind !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: auth.user.id, ...patch }, { onConflict: "id" })
    .select(
      "id, full_name, avatar_url, plan, created_at, language, headline, tagline, watermark_url, instagram_handle, tiktok_handle, youtube_handle",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Profile row was not persisted" },
      { status: 500 },
    );
  }

  return NextResponse.json({ profile: data });
}
