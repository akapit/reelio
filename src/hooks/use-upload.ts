"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { generateThumbnail } from "@/lib/image-thumbnail";
import { getAspectRatioLabel } from "@/lib/aspect-ratio";
import { useI18n } from "@/lib/i18n/client";

interface PresignedUpload {
  presignedUrl: string;
  key: string;
  publicUrl: string;
}

interface ImageThumbResult {
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
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
 * For images, decode + resize once: upload the thumbnail to R2 and surface the
 * source's intrinsic width/height so the asset row gets `metadata.dimensions`
 * tagged in the same insert. Failures here don't block the upload — we still
 * store the original; the photos tab + backfill flow fall back to the original
 * until a thumbnail is available, and the server-side AR backfill handles the
 * missing-dimensions case for the warning.
 */
async function processImage(file: File): Promise<ImageThumbResult> {
  try {
    const { blob, sourceWidth, sourceHeight } = await generateThumbnail(file);
    const { presignedUrl, publicUrl } = await getPresignedUrl(
      "thumb.jpg",
      blob.type || "image/jpeg",
    );
    await putToR2(presignedUrl, blob, blob.type || "image/jpeg");
    return {
      thumbnailUrl: publicUrl,
      width: sourceWidth,
      height: sourceHeight,
    };
  } catch (err) {
    console.warn("[upload] thumbnail generation failed", err);
    return { thumbnailUrl: null, width: null, height: null };
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

      const imageResult: ImageThumbResult = isImage
        ? await processImage(file)
        : { thumbnailUrl: null, width: null, height: null };

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(t.hooks.notAuthenticated);

      const assetType = file.type.startsWith("video/") ? "video" : "image";
      const metadata: Record<string, unknown> = {};
      if (
        imageResult.width !== null &&
        imageResult.height !== null &&
        imageResult.height > 0
      ) {
        const w = imageResult.width;
        const h = imageResult.height;
        metadata.dimensions = {
          width: w,
          height: h,
          aspectRatio: w / h,
          label: getAspectRatioLabel(w, h),
        };
      }

      const { data, error } = await supabase
        .from("assets")
        .insert({
          project_id: projectId,
          user_id: user.id,
          original_url: original.publicUrl,
          thumbnail_url: imageResult.thumbnailUrl,
          asset_type: assetType,
          status: "uploaded",
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets", projectId] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success(t.hooks.fileUploaded);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t.hooks.uploadFailed);
    },
  });
}
