"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { generateThumbnail } from "@/lib/image-thumbnail";
import { useI18n } from "@/lib/i18n/client";

interface PresignedUpload {
  presignedUrl: string;
  key: string;
  publicUrl: string;
}

async function getPresignedUrl(
  filename: string,
  contentType: string,
): Promise<PresignedUpload> {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  return res.json();
}

async function putToR2(
  presignedUrl: string,
  body: Blob,
  contentType: string,
): Promise<void> {
  const res = await fetch(presignedUrl, {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) throw new Error("Upload failed");
}

/**
 * For images, generate a small JPEG thumbnail client-side and upload it
 * alongside the original. Failures here don't block the upload — the asset
 * row still gets the original URL; the photos tab and backfill flow will
 * fall back to the original until a thumbnail is available.
 */
async function uploadThumbnail(file: File): Promise<string | null> {
  try {
    const thumb = await generateThumbnail(file);
    const { presignedUrl, publicUrl } = await getPresignedUrl(
      "thumb.jpg",
      thumb.type || "image/jpeg",
    );
    await putToR2(presignedUrl, thumb, thumb.type || "image/jpeg");
    return publicUrl;
  } catch (err) {
    console.warn("[upload] thumbnail generation failed", err);
    return null;
  }
}

export function useUpload(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();
  const { t } = useI18n();

  return useMutation({
    mutationFn: async (file: File) => {
      const isImage = file.type.startsWith("image/");

      const original = await getPresignedUrl(file.name, file.type);
      await putToR2(original.presignedUrl, file, file.type);

      const thumbnailUrl = isImage ? await uploadThumbnail(file) : null;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(t.hooks.notAuthenticated);

      const assetType = file.type.startsWith("video/") ? "video" : "image";
      const { data, error } = await supabase
        .from("assets")
        .insert({
          project_id: projectId,
          user_id: user.id,
          original_url: original.publicUrl,
          thumbnail_url: thumbnailUrl,
          asset_type: assetType,
          status: "uploaded",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets", projectId] });
      toast.success(t.hooks.fileUploaded);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t.hooks.uploadFailed);
    },
  });
}
