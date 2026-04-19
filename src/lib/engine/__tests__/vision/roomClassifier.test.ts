import { describe, expect, it } from "vitest";
import { classifyRoom } from "@/lib/engine/vision/roomClassifier";
import type { VisionLabel } from "@/lib/engine/models";

const L = (name: string, confidence: number): VisionLabel => ({ name, confidence });

describe("classifyRoom — primary rooms", () => {
  it("kitchen from label", () => {
    expect(classifyRoom([L("kitchen", 0.95)], [])).toBe("kitchen");
  });

  it("kitchen from stove object at 0.65", () => {
    expect(classifyRoom([], [L("stove", 0.65)])).toBe("kitchen");
  });

  it("kitchen from refrigerator object at 0.6", () => {
    expect(classifyRoom([], [L("refrigerator", 0.6)])).toBe("kitchen");
  });

  it("bathroom from toilet label", () => {
    expect(classifyRoom([L("toilet", 0.9), L("shower", 0.7)], [])).toBe("bathroom");
  });

  it("bedroom from bed label", () => {
    expect(classifyRoom([L("bed", 0.88), L("pillow", 0.7)], [])).toBe("bedroom");
  });

  it("dining room", () => {
    expect(classifyRoom([L("dining room", 0.9)], [])).toBe("dining");
  });

  it("living room via sofa", () => {
    expect(classifyRoom([L("sofa", 0.85), L("fireplace", 0.6)], [])).toBe("living");
  });

  it("exterior via facade + sky", () => {
    expect(classifyRoom([L("facade", 0.9), L("sky", 0.85)], [])).toBe("exterior");
  });

  it("balcony via terrace + view", () => {
    expect(classifyRoom([L("terrace", 0.8), L("view", 0.7)], [])).toBe("balcony");
  });

  it("office via desk", () => {
    expect(classifyRoom([L("desk", 0.85), L("monitor", 0.7)], [])).toBe("office");
  });

  it("hallway via corridor", () => {
    expect(classifyRoom([L("hallway", 0.8), L("corridor", 0.75)], [])).toBe("hallway");
  });
});

describe("classifyRoom — ambiguity & thresholds", () => {
  it("kitchen beats bathroom (rule 1 precedence)", () => {
    expect(
      classifyRoom(
        [L("kitchen", 0.9), L("bathroom", 0.85)],
        [],
      ),
    ).toBe("kitchen");
  });

  it("kitchen beats bedroom", () => {
    expect(
      classifyRoom(
        [L("bedroom", 0.9), L("kitchen", 0.8)],
        [],
      ),
    ).toBe("kitchen");
  });

  it("bedroom + office -> bedroom wins (higher rule priority)", () => {
    expect(
      classifyRoom(
        [L("bed", 0.8), L("desk", 0.7)],
        [],
      ),
    ).toBe("bedroom");
  });

  it("living + dining -> dining wins (rule 4 before rule 5)", () => {
    expect(
      classifyRoom(
        [L("dining table", 0.8), L("sofa", 0.7)],
        [],
      ),
    ).toBe("dining");
  });

  it("hallway blocked by bed -> falls through to bedroom", () => {
    expect(
      classifyRoom(
        [L("hallway", 0.8), L("bed", 0.85)],
        [],
      ),
    ).toBe("bedroom");
  });

  it("below 0.5 -> other", () => {
    expect(classifyRoom([L("kitchen", 0.4), L("bed", 0.3)], [])).toBe("other");
  });

  it("stove below 0.6 -> not kitchen", () => {
    expect(classifyRoom([], [L("stove", 0.55)])).toBe("other");
  });

  it("all weak labels -> other", () => {
    expect(
      classifyRoom(
        [L("chair", 0.3), L("wall", 0.2), L("light", 0.1)],
        [],
      ),
    ).toBe("other");
  });

  it("empty arrays -> other", () => {
    expect(classifyRoom([], [])).toBe("other");
  });

  it("exterior wins over balcony when facade present", () => {
    expect(
      classifyRoom(
        [L("facade", 0.9), L("balcony", 0.8)],
        [],
      ),
    ).toBe("exterior");
  });
});
