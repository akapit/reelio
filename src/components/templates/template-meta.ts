export type TemplateTone = "warm" | "cool" | "amber" | "sunset" | "mono";

export interface TemplateMeta {
  style: string;
  tone: TemplateTone;
  durationLabel: string;
}

export const TEMPLATE_META: Record<string, TemplateMeta> = {
  luxury_30s:   { style: "Editorial", tone: "warm",   durationLabel: "30s" },
  family_30s:   { style: "Lifestyle", tone: "amber",  durationLabel: "30s" },
  fast_15s:     { style: "Minimal",   tone: "mono",   durationLabel: "15s" },
  investor_20s: { style: "Aerial",    tone: "cool",   durationLabel: "20s" },
  premium_45s:  { style: "Cinematic", tone: "sunset", durationLabel: "45s" },
};

export const FALLBACK_META: TemplateMeta = {
  style: "Atelier",
  tone: "warm",
  durationLabel: "—",
};
