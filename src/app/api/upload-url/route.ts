import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePresignedUploadUrl, getPublicUrl } from "@/lib/r2";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { filename, contentType } = await req.json();
  const ext = filename.split(".").pop();
  const key = `${user.id}/${randomUUID()}.${ext}`;
  const presignedUrl = await generatePresignedUploadUrl(key, contentType);

  const publicUrl = getPublicUrl(key);
  return NextResponse.json({ presignedUrl, key, publicUrl });
}
