"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { pickPropertyThumbnailUrl } from "@/lib/properties/thumbnail";
import { isLogoAsset } from "@/lib/video-logo";

interface PropertyAssetForThumbnail {
  id: string;
  project_id: string;
  asset_type: string | null;
  status: string | null;
  tool_used: string | null;
  original_url: string | null;
  processed_url: string | null;
  thumbnail_url: string | null;
  source_asset_id: string | null;
  metadata: unknown;
  created_at: string | null;
}

export function useProperties() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const projectIds = (data ?? []).map((row) => row.id).filter(Boolean);
      if (projectIds.length === 0) return data ?? [];

      const { data: assets, error: assetsError } = await supabase
        .from("assets")
        .select(
          "id, project_id, asset_type, status, tool_used, original_url, processed_url, thumbnail_url, source_asset_id, metadata, created_at",
        )
        .in("project_id", projectIds);
      if (assetsError) throw assetsError;

      const assetsByProject = new Map<string, PropertyAssetForThumbnail[]>();
      for (const asset of (assets ?? []) as PropertyAssetForThumbnail[]) {
        const list = assetsByProject.get(asset.project_id) ?? [];
        list.push(asset);
        assetsByProject.set(asset.project_id, list);
      }

      return (data ?? []).map((row) => {
        const projectAssets = assetsByProject.get(row.id) ?? [];
        return {
          ...row,
          assets: projectAssets,
          assetCount: projectAssets.filter((asset) => !isLogoAsset(asset)).length,
          thumbnailUrl: pickPropertyThumbnailUrl(projectAssets),
        };
      });
    },
  });
}

export function useCreateProperty() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; property_address?: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          ...input,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties"] }),
  });
}
