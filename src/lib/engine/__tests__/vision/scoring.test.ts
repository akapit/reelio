import { describe, expect, it } from "vitest";
import {
  computeEligibility,
  computeScores,
} from "@/lib/engine/vision/scoring";
import {
  FIXTURE_HERO_EXTERIOR,
  FIXTURE_LOWRES_BLURRY,
  FIXTURE_UNSAFE_ADULT,
  FIXTURE_WOW_VIEW,
  makeRaw,
} from "./__fixtures__/visionResponses";

describe("computeScores — quality", () => {
  it("returns ~1 for a 4K safe image", () => {
    const s = computeScores(FIXTURE_HERO_EXTERIOR);
    expect(s.quality).toBe(1);
  });

  it("returns low quality for a 320x240 image", () => {
    const s = computeScores(FIXTURE_LOWRES_BLURRY);
    // 320*240 / (1920*1080) = 0.037
    expect(s.quality).toBeGreaterThan(0);
    expect(s.quality).toBeLessThan(0.1);
  });

  it("zeros quality when adult content flagged", () => {
    const s = computeScores(FIXTURE_UNSAFE_ADULT);
    expect(s.quality).toBe(0);
  });

  it("treats missing safeSearch as safe", () => {
    const s = computeScores(
      makeRaw({ width: 1920, height: 1080, labels: [] }),
    );
    expect(s.quality).toBe(1);
  });
});

describe("computeScores — lighting", () => {
  it("penalizes very dark images", () => {
    const s = computeScores(FIXTURE_LOWRES_BLURRY);
    expect(s.lighting).toBeLessThan(0.25);
  });

  it("gives mid-brightness a high score", () => {
    const raw = makeRaw({
      width: 1920,
      height: 1080,
      colors: [{ r: 128, g: 128, b: 128, pixelFraction: 1 }],
    });
    const s = computeScores(raw);
    expect(s.lighting).toBeGreaterThan(0.99);
  });

  it("defaults to 0.5 when no color info", () => {
    const raw = makeRaw({ width: 1920, height: 1080 });
    const s = computeScores(raw);
    expect(s.lighting).toBeCloseTo(0.5, 3);
  });

  it("penalizes very bright (washed-out) images", () => {
    const raw = makeRaw({
      width: 1920,
      height: 1080,
      colors: [{ r: 250, g: 250, b: 250, pixelFraction: 1 }],
    });
    const s = computeScores(raw);
    expect(s.lighting).toBeLessThan(0.1);
  });
});

describe("computeScores — composition", () => {
  it("scores 1 for 16:9", () => {
    const s = computeScores(FIXTURE_HERO_EXTERIOR);
    expect(s.composition).toBe(1);
  });

  it("penalizes very tall portrait", () => {
    const raw = makeRaw({ width: 600, height: 1200 });
    const s = computeScores(raw);
    expect(s.composition).toBeLessThan(0.6);
  });

  it("handles square 1:1", () => {
    const raw = makeRaw({ width: 1080, height: 1080 });
    const s = computeScores(raw);
    // ar=1; penalty = 0.8*|1 - 16/9| = 0.8 * 0.777 ≈ 0.62; score ≈ 0.38
    expect(s.composition).toBeGreaterThan(0.3);
    expect(s.composition).toBeLessThan(0.45);
  });
});

describe("computeScores — theme scores", () => {
  const rows: Array<{
    label: string;
    raw: ReturnType<typeof makeRaw>;
    wow?: [number, number];
    hero?: [number, number];
    detail?: [number, number];
  }> = [
    {
      label: "hero exterior with sky",
      raw: FIXTURE_HERO_EXTERIOR,
      hero: [0.5, 1],
      wow: [0.3, 1],
    },
    {
      label: "wow view balcony",
      raw: FIXTURE_WOW_VIEW,
      wow: [0.5, 1],
      hero: [0, 0.2],
    },
    {
      label: "low-res blurry wall",
      raw: FIXTURE_LOWRES_BLURRY,
      wow: [0, 0.05],
      hero: [0, 0.05],
      detail: [0, 0.05],
    },
    {
      label: "detail furniture decor",
      raw: makeRaw({
        width: 1920,
        height: 1080,
        labels: [
          { description: "Furniture", score: 0.9 },
          { description: "Decor", score: 0.8 },
          { description: "Texture", score: 0.7 },
        ],
      }),
      detail: [0.5, 1],
    },
    {
      label: "hero facade with driveway",
      raw: makeRaw({
        width: 1920,
        height: 1080,
        labels: [
          { description: "Facade", score: 0.9 },
          { description: "Driveway", score: 0.8 },
        ],
      }),
      hero: [0.5, 1],
    },
    {
      label: "no matching labels",
      raw: makeRaw({
        width: 1920,
        height: 1080,
        labels: [{ description: "Chair", score: 0.8 }],
      }),
      hero: [0, 0.05],
      wow: [0, 0.05],
      detail: [0, 0.05],
    },
  ];

  for (const row of rows) {
    it(`row: ${row.label}`, () => {
      const s = computeScores(row.raw);
      if (row.wow) {
        expect(s.wow).toBeGreaterThanOrEqual(row.wow[0]);
        expect(s.wow).toBeLessThanOrEqual(row.wow[1]);
      }
      if (row.hero) {
        expect(s.hero).toBeGreaterThanOrEqual(row.hero[0]);
        expect(s.hero).toBeLessThanOrEqual(row.hero[1]);
      }
      if (row.detail) {
        expect(s.detail).toBeGreaterThanOrEqual(row.detail[0]);
        expect(s.detail).toBeLessThanOrEqual(row.detail[1]);
      }
    });
  }
});

describe("computeEligibility", () => {
  it("flags hero + wow + closing", () => {
    const e = computeEligibility({
      quality: 1,
      lighting: 1,
      composition: 1,
      wow: 0.9,
      detail: 0.5,
      hero: 0.8,
    });
    expect(e).toEqual({ asHero: true, asWow: true, asClosing: true });
  });

  it("closing when hero >= 0.4 alone", () => {
    const e = computeEligibility({
      quality: 1,
      lighting: 1,
      composition: 1,
      wow: 0.1,
      detail: 0.1,
      hero: 0.45,
    });
    expect(e.asClosing).toBe(true);
    expect(e.asHero).toBe(false);
  });

  it("no flags when all low", () => {
    const e = computeEligibility({
      quality: 0.1,
      lighting: 0.1,
      composition: 0.1,
      wow: 0.1,
      detail: 0.1,
      hero: 0.1,
    });
    expect(e).toEqual({ asHero: false, asWow: false, asClosing: false });
  });
});
