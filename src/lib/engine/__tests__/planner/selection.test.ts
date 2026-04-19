import { describe, expect, it } from "vitest";
import { pickImage } from "@/lib/engine/planner/selection";
import type { TemplateSlot } from "@/lib/engine/models";
import { makeDataset, twelveImageFixture } from "./__fixtures__/images";

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

describe("pickImage", () => {
  it("picks highest-hero exterior for an exterior-required slot", () => {
    const dataset = makeDataset(twelveImageFixture());
    const s = slot({
      id: "opening-exterior",
      requiredRoomType: "exterior",
      onMissing: "use_hero",
    });
    const picked = pickImage(s, dataset, new Set());
    expect(picked).not.toBeNull();
    expect(picked!.path).toBe("/img/ext-1.jpg");
    expect(picked!.roomType).toBe("exterior");
  });

  it("returns highest-wow image when slot requires no room type and onMissing is use_wow", () => {
    const dataset = makeDataset(twelveImageFixture());
    const s = slot({
      id: "wow-slot",
      requiredRoomType: null,
      onMissing: "use_wow",
    });
    const picked = pickImage(s, dataset, new Set());
    expect(picked).not.toBeNull();
    // bed-1 has wow 0.95 — highest in the fixture.
    expect(picked!.path).toBe("/img/bed-1.jpg");
  });

  it("returns null when a kitchen-required slot has all kitchens in `used`", () => {
    const dataset = makeDataset(twelveImageFixture());
    const s = slot({
      id: "feature-kitchen",
      requiredRoomType: "kitchen",
      fallbackRoomTypes: [],
      onMissing: "skip",
    });
    const used = new Set<string>(["/img/kit-1.jpg"]);
    const picked = pickImage(s, dataset, used);
    expect(picked).toBeNull();
  });

  it("falls back to fallbackRoomTypes when required room type has no matches", () => {
    const dataset = makeDataset(twelveImageFixture());
    const s = slot({
      id: "feature-kitchen",
      requiredRoomType: "kitchen",
      fallbackRoomTypes: ["dining"],
      onMissing: "skip",
    });
    const used = new Set<string>(["/img/kit-1.jpg"]);
    const picked = pickImage(s, dataset, used);
    expect(picked).not.toBeNull();
    expect(picked!.roomType).toBe("dining");
  });

  it("skips images the quality check marked !usable", () => {
    const dataset = makeDataset([
      ...twelveImageFixture(),
      // An unusable exterior — should be filtered out regardless of roomType.
      {
        path: "/img/ext-junk.jpg",
        roomType: "exterior",
        usable: false,
        reason: "blurry",
        dims: { width: 1920, height: 1080, aspectRatio: 1.78 },
        visionLabels: [],
        visionObjects: [],
        dominantColorsHex: [],
      },
    ]);
    const s = slot({
      id: "opening-exterior",
      requiredRoomType: "exterior",
      onMissing: "use_hero",
    });
    const picked = pickImage(s, dataset, new Set());
    // Should pick the first usable exterior in fixture order.
    expect(picked!.path).toBe("/img/ext-1.jpg");
  });
});
