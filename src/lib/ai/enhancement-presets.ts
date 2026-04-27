/**
 * Source-of-truth fallback for the AI photo-enhancement presets. Mirrors the
 * `ai_enhancement_presets` table (migration 008). The DB row wins at runtime
 * — this seed is the offline default + the typed contract the modal/UI
 * relies on.
 */

export const PRESET_KEYS = [
  "quality",
  "expand",
  "rearrange",
  "clean",
  "refurnish",
] as const;

export type PresetKey = (typeof PRESET_KEYS)[number];

export const DEFAULT_ENHANCEMENT_MODEL = "openai/gpt-image-2.0";

export interface EnhancementPreset {
  key: PresetKey;
  prompt: string;
  model: string;
  params: Record<string, unknown>;
  sortOrder: number;
}

export const FALLBACK_PRESETS: EnhancementPreset[] = [
  {
    key: "quality",
    prompt:
      "Enhance this real-estate photo: improve natural lighting, color balance, sharpness, and dynamic range. Keep the scene composition exactly the same. Photorealistic.",
    model: DEFAULT_ENHANCEMENT_MODEL,
    params: {},
    sortOrder: 10,
  },
  {
    key: "expand",
    prompt:
      "Outpaint this real-estate photo by ~25 percent on all sides. Extend the room realistically, matching existing materials, light direction, perspective, and depth of field. Do not invent new furniture inside the original frame.",
    model: DEFAULT_ENHANCEMENT_MODEL,
    params: {},
    sortOrder: 20,
  },
  {
    key: "rearrange",
    prompt:
      "Keep the same room walls, floor, ceiling, and windows exactly. Rearrange the existing furniture into a more spacious, professionally staged layout. Photorealistic interior design.",
    model: DEFAULT_ENHANCEMENT_MODEL,
    params: {},
    sortOrder: 30,
  },
  {
    key: "clean",
    prompt:
      "Remove clutter, personal items, cables, signage, and visible mess from this real-estate photo. Preserve all walls, fixtures, and structural furniture. Photorealistic.",
    model: DEFAULT_ENHANCEMENT_MODEL,
    params: {},
    sortOrder: 40,
  },
  {
    key: "refurnish",
    prompt:
      "Replace existing furniture with modern, neutral, professionally staged real-estate furniture. Keep the same room geometry, walls, flooring, windows, and lighting direction.",
    model: DEFAULT_ENHANCEMENT_MODEL,
    params: {},
    sortOrder: 50,
  },
];

export function isPresetKey(value: unknown): value is PresetKey {
  return typeof value === "string" && (PRESET_KEYS as readonly string[]).includes(value);
}

export function findFallbackPreset(key: PresetKey): EnhancementPreset {
  return (
    FALLBACK_PRESETS.find((p) => p.key === key) ?? FALLBACK_PRESETS[0]
  );
}
