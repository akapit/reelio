import { describe, it, expect } from "vitest";
import { computeCropRect } from "@/lib/engine/vision/smartCrop";
import type { VisionObject } from "@/lib/engine/models";

function obj(bbox: { x0: number; y0: number; x1: number; y1: number }, confidence = 0.9): VisionObject {
  return { name: "sofa", confidence, bbox };
}

describe("computeCropRect", () => {
  it("no-op when source AR already matches target within tolerance", () => {
    const rect = computeCropRect({ width: 1920, height: 1080 }, [], 16 / 9);
    expect(rect.noop).toBe(true);
    expect(rect.reason).toBe("ar_matches");
    expect(rect).toMatchObject({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  it("4:3 landscape → 9:16 portrait, no subjects: centered crop", () => {
    const rect = computeCropRect({ width: 4000, height: 3000 }, [], 9 / 16);
    expect(rect.noop).toBe(false);
    expect(rect.reason).toBe("no_subject_centered");
    // Target ratio is narrow portrait; expected crop ≈ 1688 × 3000, centered.
    expect(rect.h).toBe(3000);
    expect(rect.w).toBe(Math.round(3000 * (9 / 16))); // 1688
    expect(rect.x).toBe(Math.round((4000 - rect.w) / 2));
    expect(rect.y).toBe(0);
  });

  it("4:3 landscape → 9:16, subject in left third: crop shifts left", () => {
    // Subject (sofa) bbox at x ∈ [0.05, 0.25], y ∈ [0.4, 0.7]
    const objects = [obj({ x0: 0.05, y0: 0.4, x1: 0.25, y1: 0.7 })];
    const rect = computeCropRect({ width: 4000, height: 3000 }, objects, 9 / 16);
    expect(rect.noop).toBe(false);
    expect(rect.reason).toBe("subject_strong");
    // Subject center x ≈ 0.15 * 4000 = 600px. Crop width ≈ 1688.
    // Unclamped crop x = 600 - 844 = -244 → clamped to 0.
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.w).toBe(Math.round(3000 * (9 / 16)));
    expect(rect.h).toBe(3000);
  });

  it("4:3 landscape → 9:16, subject on the right edge: crop shifts right", () => {
    // Subject near right edge (x ∈ [0.8, 0.95]).
    const objects = [obj({ x0: 0.8, y0: 0.3, x1: 0.95, y1: 0.7 })];
    const rect = computeCropRect({ width: 4000, height: 3000 }, objects, 9 / 16);
    // Subject center x = 0.875 * 4000 = 3500. Crop width ≈ 1688.
    // Unclamped x = 3500 - 844 = 2656. Max-x = 4000 - 1688 = 2312. Clamped.
    expect(rect.reason).toBe("subject_strong");
    expect(rect.x).toBe(4000 - rect.w);
  });

  it("drops to weak-confidence threshold when no strong bboxes", () => {
    const objects = [obj({ x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.6 }, 0.35)];
    const rect = computeCropRect({ width: 4000, height: 3000 }, objects, 9 / 16);
    expect(rect.reason).toBe("subject_weak");
    // Subject centered at (0.5, 0.5) → crop essentially centered.
    expect(rect.x).toBe(Math.round((4000 - rect.w) / 2));
  });

  it("9:16 portrait → 16:9 landscape: tall-to-wide crop", () => {
    const rect = computeCropRect({ width: 1080, height: 1920 }, [], 16 / 9);
    expect(rect.noop).toBe(false);
    expect(rect.w).toBe(1080);
    expect(rect.h).toBe(Math.round(1080 / (16 / 9))); // 608
    // No subjects → centered vertically
    expect(rect.y).toBe(Math.round((1920 - rect.h) / 2));
  });

  it("rounds crop dims to even numbers (yuv420p/yuvj420p chroma grid)", () => {
    // Production failure: 5712x4284 → 16:9 produced crop=5712:3213:0:1071,
    // ffmpeg auto-aligned chroma grid pushed y+h past H → "too big" error.
    // Every value must be even to keep ffmpeg from shifting coordinates.
    const rect = computeCropRect({ width: 5712, height: 4284 }, [], 16 / 9);
    expect(rect.noop).toBe(false);
    expect(rect.w % 2).toBe(0);
    expect(rect.h % 2).toBe(0);
    expect(rect.x % 2).toBe(0);
    expect(rect.y % 2).toBe(0);
    // And the rect must still fit inside the source.
    expect(rect.x + rect.w).toBeLessThanOrEqual(5712);
    expect(rect.y + rect.h).toBeLessThanOrEqual(4284);
  });

  it("degenerate: zero dims returns safe fallback", () => {
    const rect = computeCropRect({ width: 0, height: 0 }, [], 9 / 16);
    expect(rect.reason).toBe("degenerate");
    expect(rect.noop).toBe(true);
  });
});
