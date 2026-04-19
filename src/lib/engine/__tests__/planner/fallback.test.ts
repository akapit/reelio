import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/lib/engine/planner/planner";
import type { Template, TimelineBlueprint } from "@/lib/engine/models";
import { makeDataset, makeImage } from "./__fixtures__/images";

function isBlueprint(
  v: TimelineBlueprint | { abortedSlotIds: string[] },
): v is TimelineBlueprint {
  return (v as TimelineBlueprint).shots !== undefined;
}

describe("fallback behaviour", () => {
  it("use_hero: when all exteriors already used, picks the highest-hero unused interior", () => {
    // Dataset with exactly one exterior (highest hero) and several interiors.
    const images = [
      makeImage({
        path: "/img/ext.jpg",
        roomType: "exterior",
        scores: { hero: 0.95, quality: 0.9, wow: 0.8, composition: 0.8, lighting: 0.8, detail: 0.8 },
      }),
      // Interior A — moderate hero
      makeImage({
        path: "/img/int-a.jpg",
        roomType: "living",
        scores: { hero: 0.5, quality: 0.7, wow: 0.5, composition: 0.6, lighting: 0.6, detail: 0.6 },
      }),
      // Interior B — high hero among interiors
      makeImage({
        path: "/img/int-b.jpg",
        roomType: "living",
        scores: { hero: 0.85, quality: 0.75, wow: 0.6, composition: 0.65, lighting: 0.7, detail: 0.7 },
      }),
      makeImage({
        path: "/img/int-c.jpg",
        roomType: "kitchen",
        scores: { hero: 0.4, quality: 0.7, wow: 0.5, composition: 0.6, lighting: 0.6, detail: 0.6 },
      }),
    ];
    const dataset = makeDataset(images);

    const template: Template = {
      name: "hero_fallback_fixture",
      targetDurationSec: 12,
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
        {
          id: "first-exterior",
          label: "First",
          requiredRoomType: "exterior",
          fallbackRoomTypes: [],
          onMissing: "use_hero",
          minDuration: 4,
          maxDuration: 8,
          defaultMotion: "ken_burns_in",
          transitionOut: "fade",
          allowReuse: false,
          overlayText: null,
        },
        {
          id: "second-exterior",
          label: "Second",
          requiredRoomType: "exterior",
          fallbackRoomTypes: [],
          onMissing: "use_hero",
          minDuration: 4,
          maxDuration: 8,
          defaultMotion: "ken_burns_in",
          transitionOut: "fade",
          allowReuse: false,
          overlayText: null,
        },
      ],
    };

    const result = buildTimeline(dataset, template);
    expect(isBlueprint(result)).toBe(true);
    if (!isBlueprint(result)) return;

    expect(result.shots).toHaveLength(2);
    expect(result.shots[0].imagePath).toBe("/img/ext.jpg");
    expect(result.shots[0].fallbackApplied).toBeNull();
    // Second slot: no more exteriors → use_hero fallback → highest-hero unused = int-b.
    expect(result.shots[1].imagePath).toBe("/img/int-b.jpg");
    expect(result.shots[1].fallbackApplied).toBe("hero_fallback");
  });

  it("use_wow: when required room type has no match, falls back to highest-wow unused image", () => {
    // One exterior so requiredRoomType:"office" slot has nothing — onMissing use_wow
    // Picks highest wow across the dataset.
    const images = [
      makeImage({
        path: "/img/ext.jpg",
        roomType: "exterior",
        scores: { hero: 0.9, quality: 0.85, wow: 0.5, composition: 0.8, lighting: 0.8, detail: 0.8 },
      }),
      makeImage({
        path: "/img/liv.jpg",
        roomType: "living",
        scores: { hero: 0.5, quality: 0.7, wow: 0.45, composition: 0.65, lighting: 0.65, detail: 0.65 },
      }),
      makeImage({
        path: "/img/bed.jpg",
        roomType: "bedroom",
        scores: { hero: 0.5, quality: 0.7, wow: 0.88, composition: 0.7, lighting: 0.7, detail: 0.7 },
      }),
    ];
    const dataset = makeDataset(images);

    const template: Template = {
      name: "wow_fallback_fixture",
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
        {
          id: "office-showcase",
          label: "Office",
          requiredRoomType: "office",
          fallbackRoomTypes: [],
          onMissing: "use_wow",
          minDuration: 4,
          maxDuration: 8,
          defaultMotion: "slow_zoom",
          transitionOut: "fade",
          allowReuse: false,
          overlayText: null,
        },
      ],
    };

    const result = buildTimeline(dataset, template);
    expect(isBlueprint(result)).toBe(true);
    if (!isBlueprint(result)) return;
    expect(result.shots).toHaveLength(1);
    // Highest wow is bed.jpg (0.88).
    expect(result.shots[0].imagePath).toBe("/img/bed.jpg");
    expect(result.shots[0].fallbackApplied).toBe("wow_fallback");
  });
});
