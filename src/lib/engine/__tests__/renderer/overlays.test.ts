import { describe, expect, it } from "vitest";

import type { ShotPlan, TimelineBlueprint } from "@/lib/engine/models";
import {
  buildDrawText,
  escapeDrawText,
} from "@/lib/engine/renderer/overlays";

function makeShot(
  order: number,
  durationSec: number,
  overlayText: string | null,
): ShotPlan {
  return {
    slotId: `slot_${order}`,
    order,
    imagePath: `/tmp/img${order}.jpg`,
    imageRoomType: "living",
    durationSec,
    motion: {
      type: "static",
      startScale: 1,
      endScale: 1,
      startXPct: 0,
      endXPct: 0,
      startYPct: 0,
      endYPct: 0,
    },
    transitionOut: "fade",
    transitionDurationSec: 0.5,
    overlayText,
    fallbackApplied: null,
  };
}

function baseTimeline(overrides: Partial<TimelineBlueprint>): TimelineBlueprint {
  return {
    templateName: "luxury_30s",
    targetDurationSec: 30,
    totalDurationSec: 30,
    aspectRatio: "16:9",
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    shots: [makeShot(0, 5, null)],
    music: { mood: "luxury_cinematic", volume: 0.35 },
    overlays: {
      headline: { enabled: false, text: null },
      captions: { enabled: false },
      cta: { enabled: false, text: null },
    },
    unfilledSlotIds: [],
    warnings: [],
    ...overrides,
  };
}

describe("overlays.buildDrawText", () => {
  it("headline only → one fragment", () => {
    const tl = baseTimeline({
      overlays: {
        headline: { enabled: true, text: "Welcome" },
        captions: { enabled: false },
        cta: { enabled: false, text: null },
      },
    });
    const out = buildDrawText(tl, "/fonts/Inter-Bold.ttf");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^drawtext=/);
    expect(out[0]).toContain("text='Welcome'");
    expect(out[0]).toContain("fontsize=64");
  });

  it("skips headline when text is empty", () => {
    const tl = baseTimeline({
      overlays: {
        headline: { enabled: true, text: null },
        captions: { enabled: false },
        cta: { enabled: false, text: null },
      },
    });
    expect(buildDrawText(tl, "")).toHaveLength(0);
  });

  it("captions on + 2 shots with overlayText + headline → 3 fragments", () => {
    const tl = baseTimeline({
      totalDurationSec: 11,
      shots: [
        makeShot(0, 3, "First room"),
        makeShot(1, 4, "Second room"),
        makeShot(2, 4, null),
      ],
      overlays: {
        headline: { enabled: true, text: "Welcome Home" },
        captions: { enabled: true },
        cta: { enabled: false, text: null },
      },
    });
    const out = buildDrawText(tl, "/f.ttf");
    expect(out).toHaveLength(3);
    // First is headline, then two captions.
    expect(out[0]).toContain("Welcome Home");
    expect(out[1]).toContain("First room");
    expect(out[1]).toContain("between(t,0,3)");
    expect(out[2]).toContain("Second room");
    expect(out[2]).toContain("between(t,3,7)");
  });

  it("cta fragment uses totalDurationSec - 3 threshold", () => {
    const tl = baseTimeline({
      totalDurationSec: 30,
      overlays: {
        headline: { enabled: false, text: null },
        captions: { enabled: false },
        cta: { enabled: true, text: "Call Now" },
      },
    });
    const out = buildDrawText(tl, "");
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("Call Now");
    expect(out[0]).toContain("gte(t,27)");
    expect(out[0]).toContain("fontsize=48");
  });

  it("drops font clause when fontPath is empty", () => {
    const tl = baseTimeline({
      overlays: {
        headline: { enabled: true, text: "Hi" },
        captions: { enabled: false },
        cta: { enabled: false, text: null },
      },
    });
    const out = buildDrawText(tl, "");
    expect(out[0]).not.toContain("fontfile=");
  });
});

describe("overlays.escapeDrawText", () => {
  it("escapes single quotes", () => {
    expect(escapeDrawText("O'Brien")).toBe("O\\'Brien");
  });

  it("escapes colons", () => {
    expect(escapeDrawText("a:b")).toBe("a\\:b");
  });

  it("escapes backslashes first", () => {
    expect(escapeDrawText("a\\b")).toBe("a\\\\b");
  });

  it("combines escapes", () => {
    expect(escapeDrawText("a\\b:c'd")).toBe("a\\\\b\\:c\\'d");
  });
});
