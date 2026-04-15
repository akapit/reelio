import { describe, expect, it, vi } from "vitest";
import {
  analyzeImages,
  VisionApiError,
} from "@/lib/engine/vision/analyzer";
import type { VisionProvider } from "@/lib/engine/vision/googleVision";
import {
  FIXTURE_BEDROOM,
  FIXTURE_HERO_EXTERIOR,
  FIXTURE_KITCHEN,
  FIXTURE_LOWRES_BLURRY,
} from "./__fixtures__/visionResponses";

const noopLoad = async (): Promise<Buffer> => Buffer.from("");

describe("analyzeImages — happy path", () => {
  it("produces a full ImageDataset for 3 fake paths", async () => {
    const provider: VisionProvider = {
      annotate: vi
        .fn()
        .mockResolvedValueOnce(FIXTURE_HERO_EXTERIOR)
        .mockResolvedValueOnce(FIXTURE_KITCHEN)
        .mockResolvedValueOnce(FIXTURE_BEDROOM),
    };

    const ds = await analyzeImages(
      ["/fake/a.jpg", "/fake/b.jpg", "/fake/c.jpg"],
      { provider, loadBytes: noopLoad },
    );

    expect(ds.images).toHaveLength(3);
    expect(ds.images[0].roomType).toBe("exterior");
    expect(ds.images[1].roomType).toBe("kitchen");
    expect(ds.images[2].roomType).toBe("bedroom");
    expect(ds.usableCount).toBe(3); // all three have quality >= 0.4
    expect(ds.availableRoomTypes.sort()).toEqual(
      ["bedroom", "exterior", "kitchen"].sort(),
    );
    expect(new Date(ds.analyzedAt).toString()).not.toBe("Invalid Date");
    // verify schema shape
    expect(ds.images[0].dims.width).toBe(3840);
    expect(ds.images[0].dims.height).toBe(2160);
    expect(ds.images[0].dims.aspectRatio).toBeCloseTo(3840 / 2160, 5);
    expect(ds.images[0].visionLabels.length).toBeGreaterThan(0);
  });

  it("dedupes room types in availableRoomTypes", async () => {
    const provider: VisionProvider = {
      annotate: vi
        .fn()
        .mockResolvedValueOnce(FIXTURE_KITCHEN)
        .mockResolvedValueOnce(FIXTURE_KITCHEN),
    };
    const ds = await analyzeImages(["/a", "/b"], {
      provider,
      loadBytes: noopLoad,
    });
    expect(ds.availableRoomTypes).toEqual(["kitchen"]);
  });

  it("usableCount filters low-quality images", async () => {
    const provider: VisionProvider = {
      annotate: vi
        .fn()
        .mockResolvedValueOnce(FIXTURE_HERO_EXTERIOR)
        .mockResolvedValueOnce(FIXTURE_LOWRES_BLURRY),
    };
    const ds = await analyzeImages(["/hero.jpg", "/blur.jpg"], {
      provider,
      loadBytes: noopLoad,
    });
    expect(ds.images).toHaveLength(2);
    expect(ds.usableCount).toBe(1);
  });
});

describe("analyzeImages — resilience", () => {
  it("single failing image yields quality=0 placeholder but dataset survives", async () => {
    const provider: VisionProvider = {
      annotate: vi
        .fn()
        .mockResolvedValueOnce(FIXTURE_HERO_EXTERIOR)
        .mockRejectedValueOnce(new Error("kaboom"))
        .mockResolvedValueOnce(FIXTURE_BEDROOM),
    };
    const ds = await analyzeImages(
      ["/ok1.jpg", "/boom.jpg", "/ok2.jpg"],
      { provider, loadBytes: noopLoad },
    );
    expect(ds.images).toHaveLength(3);
    const failed = ds.images.find((m) => m.path === "/boom.jpg");
    expect(failed).toBeDefined();
    expect(failed?.scores.quality).toBe(0);
    expect(failed?.roomType).toBe("other");
  });

  it("loadBytes failure is also tolerated (single-failure)", async () => {
    const provider: VisionProvider = {
      annotate: vi.fn().mockResolvedValue(FIXTURE_HERO_EXTERIOR),
    };
    const loadBytes = vi
      .fn()
      .mockResolvedValueOnce(Buffer.from(""))
      .mockRejectedValueOnce(new Error("enoent"));
    const ds = await analyzeImages(["/a.jpg", "/missing.jpg"], {
      provider,
      loadBytes,
    });
    expect(ds.images).toHaveLength(2);
    expect(ds.images[1].scores.quality).toBe(0);
  });

  it("throws VisionApiError when every image fails", async () => {
    const provider: VisionProvider = {
      annotate: vi.fn().mockRejectedValue(new Error("upstream down")),
    };
    await expect(
      analyzeImages(["/a.jpg", "/b.jpg"], { provider, loadBytes: noopLoad }),
    ).rejects.toBeInstanceOf(VisionApiError);
  });

  it("throws VisionApiError on empty paths array", async () => {
    await expect(analyzeImages([], {})).rejects.toBeInstanceOf(VisionApiError);
  });
});
