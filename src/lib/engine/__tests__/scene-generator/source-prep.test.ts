import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Scene } from "@/lib/engine/models";
import { prepareSceneSource } from "@/lib/engine/scene-generator/source-prep";
import { applyCrop, computeCropRect } from "@/lib/engine/vision/smartCrop";

vi.mock("@/lib/engine/vision/smartCrop", () => ({
  computeCropRect: vi.fn(),
  applyCrop: vi.fn(),
}));

vi.mock("@/lib/r2", () => ({
  getPublicUrl: (key: string) => `https://r2.example/${key}`,
  r2: {
    send: vi.fn(),
  },
}));

const scene: Scene = {
  sceneId: "scene_4_wow",
  order: 3,
  slotId: "wow",
  imagePath: "https://example.com/source.jpg",
  imageRoomType: "living",
  imageLabels: [],
  imageDominantColorsHex: [],
  sceneRole: "wow",
  durationSec: 5,
  motionIntent: "slow reveal",
  templateMood: "luxury",
  overlayText: null,
  transitionOut: "fade",
  transitionDurationSec: 0.3,
};

describe("prepareSceneSource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/jpeg" },
        status: 200,
      })),
    );
  });

  it("falls back to the original remote image when smart-crop fails", async () => {
    vi.mocked(computeCropRect).mockReturnValue({
      x: 0,
      y: 1070,
      w: 5712,
      h: 3212,
      noop: false,
      reason: "subject_strong",
    });
    vi.mocked(applyCrop).mockRejectedValue(
      new Error("ffmpeg exited with code 234"),
    );

    const result = await prepareSceneSource({
      scene,
      aspectRatio: "16:9",
      imagesByPath: new Map([
        [
          scene.imagePath,
          {
            path: scene.imagePath,
            roomType: "living",
            usable: true,
            dims: { width: 5712, height: 4284, aspectRatio: 4 / 3 },
            visionLabels: [],
            visionObjects: [],
            dominantColorsHex: [],
          },
        ],
      ]),
    });

    expect(result.providerImageUrl).toBe(scene.imagePath);
    expect(result.uploadedPreparedUrl).toBeNull();
    expect(result.crop).toMatchObject({ noop: false, reason: "subject_strong" });
  });
});
