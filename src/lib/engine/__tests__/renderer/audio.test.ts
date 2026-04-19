import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TimelineBlueprint } from "@/lib/engine/models";
import { buildAudioTrack } from "@/lib/engine/renderer/audio";

function makeTimeline(overrides: Partial<TimelineBlueprint>): TimelineBlueprint {
  return {
    templateName: "luxury_30s",
    targetDurationSec: 30,
    totalDurationSec: 30,
    aspectRatio: "16:9",
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    shots: [
      {
        slotId: "a",
        order: 0,
        imagePath: "/tmp/a.jpg",
        imageRoomType: "living",
        durationSec: 30,
        motion: {
          type: "static",
          startScale: 1,
          endScale: 1,
          startXPct: 0,
          endXPct: 0,
          startYPct: 0,
          endYPct: 0,
        },
        transitionOut: "cut",
        transitionDurationSec: 0,
        overlayText: null,
        fallbackApplied: null,
      },
    ],
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

describe("audio.buildAudioTrack", () => {
  const originalEnv = process.env.ENGINE_MUSIC_DIR;

  beforeEach(() => {
    delete process.env.ENGINE_MUSIC_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENGINE_MUSIC_DIR;
    } else {
      process.env.ENGINE_MUSIC_DIR = originalEnv;
    }
  });

  it("builds filter with volume + fade in/out at correct offsets", () => {
    const tl = makeTimeline({
      music: { mood: "luxury_cinematic", volume: 0.35 },
      totalDurationSec: 30,
    });
    const { filter } = buildAudioTrack(tl);
    expect(filter).toBe(
      "volume=0.35,afade=t=in:st=0:d=0.5,afade=t=out:st=29.5:d=0.5",
    );
  });

  it("resolves default music path under src/lib/engine/assets/music", () => {
    const tl = makeTimeline({});
    const { musicPath } = buildAudioTrack(tl);
    expect(musicPath.endsWith("luxury_cinematic.mp3")).toBe(true);
    expect(musicPath).toContain(
      path.join("src", "lib", "engine", "assets", "music"),
    );
  });

  it("honors ENGINE_MUSIC_DIR override", () => {
    process.env.ENGINE_MUSIC_DIR = "/tmp/x";
    const tl = makeTimeline({});
    const { musicPath } = buildAudioTrack(tl);
    expect(musicPath).toBe("/tmp/x/luxury_cinematic.mp3");
  });

  it("uses the mood as the mp3 basename", () => {
    process.env.ENGINE_MUSIC_DIR = "/tmp/x";
    const tl = makeTimeline({
      music: { mood: "family_warm", volume: 0.4 },
    });
    const { musicPath } = buildAudioTrack(tl);
    expect(musicPath).toBe("/tmp/x/family_warm.mp3");
  });
});
