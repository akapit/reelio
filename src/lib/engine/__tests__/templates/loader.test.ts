import { describe, it, expect } from "vitest";
import { loadTemplate, listTemplates } from "../../templates/loader";
import { TemplateError } from "../../templates/errors";
import { Template, TEMPLATE_NAMES } from "../../models";

describe("loadTemplate", () => {
  it("loads luxury_30s with expected shape", () => {
    const t = loadTemplate("luxury_30s");
    expect(t.name).toBe("luxury_30s");
    expect(t.slots).toHaveLength(8);
    expect(t.targetDurationSec).toBe(30);
  });

  it("throws TemplateError for unknown names", () => {
    expect(() => loadTemplate("unknown")).toThrowError(TemplateError);
    try {
      loadTemplate("unknown");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateError);
      expect((err as Error).message).toContain("unknown template");
    }
  });

  it("all 5 JSONs round-trip through Template.parse without errors", () => {
    for (const name of TEMPLATE_NAMES) {
      const t = loadTemplate(name);
      // round-trip: re-parse the parsed object to prove it's structurally
      // valid according to the Zod schema.
      expect(() => Template.parse(t)).not.toThrow();
    }
  });
});

describe("listTemplates", () => {
  it("returns exactly 5 templates matching TEMPLATE_NAMES", () => {
    const list = listTemplates();
    expect(list).toHaveLength(5);
    expect(list.map((t) => t.name)).toEqual([...TEMPLATE_NAMES]);
  });
});
