import { describe, it, expect } from "vitest";
import { selectTemplate } from "../../templates/selector";
import { TemplateError } from "../../templates/errors";

describe("selectTemplate", () => {
  it("returns the requested template when usableCount is sufficient", () => {
    const res = selectTemplate({
      requested: "luxury_30s",
      usableCount: 10,
      availableRoomTypes: ["exterior", "living", "kitchen", "bedroom", "bathroom"],
    });
    expect(res.template.name).toBe("luxury_30s");
    expect(res.warning).toBeUndefined();
  });

  it("forces fast_15s with a warning when usableCount is between 5 and 7", () => {
    const res = selectTemplate({
      requested: "luxury_30s",
      usableCount: 6,
      availableRoomTypes: ["exterior", "living", "kitchen"],
    });
    expect(res.template.name).toBe("fast_15s");
    expect(res.warning).toBeDefined();
    expect(res.warning).toContain("fast_15s");
    expect(res.warning).toContain("6");
  });

  it("throws TemplateError with insufficient_images when usableCount < 5", () => {
    expect(() =>
      selectTemplate({
        requested: "luxury_30s",
        usableCount: 3,
        availableRoomTypes: ["exterior", "living"],
      }),
    ).toThrowError(TemplateError);
    try {
      selectTemplate({
        requested: "luxury_30s",
        usableCount: 3,
        availableRoomTypes: ["exterior", "living"],
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateError);
      expect((err as Error).message).toContain("insufficient_images");
    }
  });
});
