"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useId } from "react";

export function useAssets(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();
  // Unique per hook instance — multiple components subscribing to the same
  // project would otherwise share a Supabase channel object and trip
  // "cannot add postgres_changes callbacks after subscribe()".
  const instanceId = useId();

  useEffect(() => {
    const channel = supabase
      .channel(`assets-${projectId}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assets",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["assets", projectId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, supabase, qc, instanceId]);

  return useQuery({
    queryKey: ["assets", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      const hasProcessing = query.state.data?.some(
        (a: { status: string }) => a.status === "processing"
      );
      return hasProcessing ? 5000 : false;
    },
  });
}
