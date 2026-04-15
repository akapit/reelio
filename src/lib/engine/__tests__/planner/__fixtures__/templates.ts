import type { Template, TemplateSlot } from "@/lib/engine/models";

function slot(overrides: Partial<TemplateSlot> & { id: string }): TemplateSlot {
  return {
    id: overrides.id,
    label: overrides.label ?? overrides.id,
    requiredRoomType: overrides.requiredRoomType ?? null,
    fallbackRoomTypes: overrides.fallbackRoomTypes ?? [],
    onMissing: overrides.onMissing ?? "skip",
    minDuration: overrides.minDuration ?? 4,
    maxDuration: overrides.maxDuration ?? 10,
    defaultMotion: overrides.defaultMotion ?? "slow_zoom",
    transitionOut: overrides.transitionOut ?? "fade",
    allowReuse: overrides.allowReuse ?? false,
    overlayText: overrides.overlayText ?? null,
  };
}

export const luxuryLikeTemplate: Template = {
  name: "luxury_30s",
  targetDurationSec: 30,
  aspectRatio: "16:9",
  fps: 30,
  resolution: { width: 1920, height: 1080 },
  minUsableImages: 5,
  music: { mood: "cinematic", volume: 0.7 },
  overlays: {
    headline: { enabled: true, text: "Welcome Home" },
    captions: { enabled: false },
    cta: { enabled: true, text: "Schedule a tour" },
  },
  slots: [
    slot({
      id: "opening-exterior",
      label: "Opening exterior",
      requiredRoomType: "exterior",
      onMissing: "use_hero",
      minDuration: 5,
      maxDuration: 9,
      defaultMotion: "ken_burns_in",
      transitionOut: "fade",
      overlayText: "Welcome Home",
    }),
    slot({
      id: "feature-living",
      label: "Living room",
      requiredRoomType: "living",
      fallbackRoomTypes: ["dining"],
      onMissing: "use_hero",
      minDuration: 5,
      maxDuration: 9,
      defaultMotion: "pan_left",
      transitionOut: "fade",
    }),
    slot({
      id: "feature-kitchen",
      label: "Kitchen",
      requiredRoomType: "kitchen",
      fallbackRoomTypes: ["dining"],
      onMissing: "skip",
      minDuration: 4,
      maxDuration: 8,
      defaultMotion: "slow_zoom",
      transitionOut: "fade",
    }),
    slot({
      id: "closing-shot",
      label: "Closing hero",
      requiredRoomType: "exterior",
      onMissing: "use_hero",
      minDuration: 5,
      maxDuration: 10,
      defaultMotion: "ken_burns_out",
      transitionOut: "dip_to_white",
      allowReuse: true,
      overlayText: "Schedule a tour",
    }),
  ],
};

export const abortTemplate: Template = {
  name: "abort_fixture",
  targetDurationSec: 10,
  aspectRatio: "16:9",
  fps: 30,
  resolution: { width: 1920, height: 1080 },
  minUsableImages: 1,
  music: { mood: "cinematic", volume: 0.5 },
  overlays: {
    headline: { enabled: false, text: null },
    captions: { enabled: false },
    cta: { enabled: false, text: null },
  },
  slots: [
    slot({
      id: "opening",
      label: "Opening",
      requiredRoomType: "exterior",
      onMissing: "use_hero",
      defaultMotion: "ken_burns_in",
    }),
    slot({
      // Impossible slot: require "other" room type, no such room in fixture,
      // and abort on missing.
      id: "mandatory-other",
      label: "Impossible",
      requiredRoomType: "other",
      fallbackRoomTypes: [],
      onMissing: "abort",
      defaultMotion: "static",
      transitionOut: "cut",
    }),
  ],
};
