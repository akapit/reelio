import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  FALLBACK_PRESETS,
  type EnhancementPreset,
  type PresetKey,
  isPresetKey,
} from "@/lib/ai/enhancement-presets";

interface PresetRow {
  key: string;
  prompt: string;
  model: string;
  params: unknown;
  sort_order: number;
  enabled: boolean;
}

function rowToPreset(row: PresetRow): EnhancementPreset | null {
  if (!isPresetKey(row.key)) return null;
  const params =
    row.params && typeof row.params === "object" && !Array.isArray(row.params)
      ? (row.params as Record<string, unknown>)
      : {};
  return {
    key: row.key as PresetKey,
    prompt: row.prompt,
    model: row.model,
    params,
    sortOrder: row.sort_order,
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("ai_enhancement_presets")
    .select("key, prompt, model, params, sort_order, enabled")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  // If the table doesn't exist yet (migration not applied) or any other
  // failure, fall back to the in-code seed so the UI keeps working.
  if (error || !data) {
    return NextResponse.json({ presets: FALLBACK_PRESETS, source: "fallback" });
  }

  const presets = (data as PresetRow[])
    .map(rowToPreset)
    .filter((p): p is EnhancementPreset => p !== null);

  return NextResponse.json({
    presets: presets.length > 0 ? presets : FALLBACK_PRESETS,
    source: presets.length > 0 ? "db" : "fallback",
  });
}
