"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface Template {
  id: string;
  name: string;
  description: string | null;
  tool: "enhance" | "video";
  prompt: string;
  settings: {
    duration?: number;
    voiceoverEnabled?: boolean;
    voiceoverText?: string;
    musicEnabled?: boolean;
    musicPrompt?: string;
    /** 0..100 (UI scale) */
    musicVolume?: number;
  };
  icon: string;
  sort_order: number;
}

export function useTemplates() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
