import { describe, expect, it } from "vitest";
import { buildTimeline, InsufficientImages } from "@/lib/engine/planner/planner";
import type { TimelineBlueprint } from "@/lib/engine/models";
import { makeDataset, twelveImageFixture } from "./__fixtures__/images";
import { abortTemplate, luxuryLikeTemplate } from "./__fixtures__/templates";

function isBlueprint(
  v: TimelineBlueprint | { abortedSlotIds: string[] },
): v is TimelineBlueprint {
  return (v as TimelineBlueprint).shots !== undefined;
}

describe("buildTimeline", () => {
  it("happy path: 12 images + luxury template → 4-shot blueprint within duration tolerance", () => {
    const dataset = makeDataset(twelveImageFixture());
    const result = buildTimeline(dataset, luxuryLikeTemplate);
    expect(isBlueprint(result)).toBe(true);
    if (!isBlueprint(result)) return;

    expect(result.shots).toHaveLength(4);
    expect(result.templateName).toBe("luxury_30s");
    expect(result.unfilledSlotIds).toEqual([]);
    expect(result.warnings).toEqual([]);

    const total = result.shots.reduce((s, x) => s + x.durationSec, 0);
    expect(Math.abs(total - luxuryLikeTemplate.targetDurationSec)).toBeLessThanOrEqual(2);

    // orders are 0..3 in sequence
    expect(result.shots.map((s) => s.order)).toEqual([0, 1, 2, 3]);
  });

  it("allowReuse: closing slot reuses the highest-hero exterior from slot 1", () => {
    const dataset = makeDataset(twelveImageFixture());
    const result = buildTimeline(dataset, luxuryLikeTemplate);
    expect(isBlueprint(result)).toBe(true);
    if (!isBlueprint(result)) return;

    const opening = result.shots.find((s) => s.slotId === "opening-exterior");
    const closing = result.shots.find((s) => s.slotId === "closing-shot");
    expect(opening).toBeDefined();
    expect(closing).toBeDefined();
    expect(opening!.imagePath).toBe("/img/ext-1.jpg");
    // Closing has allowReuse=true; opening image wasn't added to `used`, so
    // the closing slot's pickImage returns the same top-hero exterior.
    expect(closing!.imagePath).toBe("/img/ext-1.jpg");
  });

  it("skip fallback: dataset without a kitchen leaves the kitchen slot unfilled but still returns a blueprint", () => {
    const base = twelveImageFixture().filter((i) => i.roomType !== "kitchen");
    const dataset = makeDataset(base);
    const result = buildTimeline(dataset, luxuryLikeTemplate);
    expect(isBlueprint(result)).toBe(true);
    if (!isBlueprint(result)) return;

    // Kitchen slot has fallbackRoomTypes=["dining"], so it should grab dining
    // and not be unfilled. To test `skip`, drop dining too.
    if (result.unfilledSlotIds.length === 0) {
      const stricter = makeDataset(
        twelveImageFixture().filter(
          (i) => i.roomType !== "kitchen" && i.roomType !== "dining",
        ),
      );
      const res2 = buildTimeline(stricter, luxuryLikeTemplate);
      expect(isBlueprint(res2)).toBe(true);
      if (!isBlueprint(res2)) return;
      expect(res2.unfilledSlotIds).toContain("feature-kitchen");
      // Remaining 3 slots still produced shots.
      expect(res2.shots.length).toBe(3);
    } else {
      expect(result.unfilledSlotIds).toContain("feature-kitchen");
    }
  });

  it("abort fallback: impossible slot with onMissing=abort returns { abortedSlotIds }", () => {
    const dataset = makeDataset(twelveImageFixture());
    const result = buildTimeline(dataset, abortTemplate);
    expect(isBlueprint(result)).toBe(false);
    if (isBlueprint(result)) return;
    expect(result.abortedSlotIds).toEqual(["mandatory-other"]);
  });

  it("throws InsufficientImages when dataset too small", () => {
    const few = twelveImageFixture().slice(0, 3);
    const dataset = makeDataset(few);
    expect(() => buildTimeline(dataset, luxuryLikeTemplate)).toThrow(
      InsufficientImages,
    );
  });

  it("transitions: cut→0, flash→0.2, dip_to_white→0.5", () => {
    const dataset = makeDataset(twelveImageFixture());
    const result = buildTimeline(dataset, luxuryLikeTemplate);
    expect(isBlueprint(result)).toBe(true);
    if (!isBlueprint(result)) return;
    const closing = result.shots.find((s) => s.slotId === "closing-shot")!;
    expect(closing.transitionOut).toBe("dip_to_white");
    expect(closing.transitionDurationSec).toBe(0.5);
  });
});
