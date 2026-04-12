"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export function useUpload(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      // 1. Get presigned URL
      const res = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { presignedUrl, publicUrl } = await res.json();

      // 2. Upload directly to R2
      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      // 3. Create asset record
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const assetType = file.type.startsWith("video/") ? "video" : "image";
      const { data, error } = await supabase
        .from("assets")
        .insert({
          project_id: projectId,
          user_id: user.id,
          original_url: publicUrl,
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
      toast.success("File uploaded successfully");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    },
  });
}
