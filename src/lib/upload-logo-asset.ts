"use client";

import { createClient } from "@/lib/supabase/client";
import { LOGO_ASSET_ROLE } from "@/lib/video-logo";

const SUPPORTED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

interface UploadedLogoAsset {
  id: string;
  url: string;
}

async function getPresignedUrl(filename: string, contentType: string) {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType }),
  });
  if (!res.ok) throw new Error("Failed to get logo upload URL");
  return res.json() as Promise<{ presignedUrl: string; publicUrl: string }>;
}

export function isSupportedLogoFile(file: File): boolean {
  return SUPPORTED_LOGO_TYPES.has(file.type);
}

export async function uploadLogoAsset(options: {
  projectId: string;
  file: File;
}): Promise<UploadedLogoAsset> {
  const { file, projectId } = options;
  if (!isSupportedLogoFile(file)) {
    throw new Error("Logo must be a PNG, JPEG, or WebP image");
  }

  const upload = await getPresignedUrl(file.name, file.type);
  const put = await fetch(upload.presignedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error("Logo upload failed");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("assets")
    .insert({
      project_id: projectId,
      user_id: user.id,
      original_url: upload.publicUrl,
      thumbnail_url: upload.publicUrl,
      asset_type: "image",
      status: "uploaded",
      metadata: {
        role: LOGO_ASSET_ROLE,
        filename: file.name,
        contentType: file.type,
      },
    })
    .select("id, original_url")
    .single();

  if (error || !data) throw error ?? new Error("Failed to save logo asset");
  return { id: data.id, url: data.original_url };
}
