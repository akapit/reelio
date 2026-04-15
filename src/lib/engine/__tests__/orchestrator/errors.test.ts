import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";
import { classifyError, toJobErrorFromToolResult } from "../../orchestrator/errors";
import { VisionApiError } from "../../vision/analyzer";
import { TemplateError } from "../../templates/errors";
import { PlannerAbort, InsufficientImages } from "../../planner/fallback";
import { FfmpegError } from "../../renderer/errors";

function makeZodError(): ZodError {
  const schema = z.object({ x: z.string() });
  const result = schema.safeParse({ x: 1 });
  if (result.success) throw new Error("expected zod error");
  return result.error;
}

describe("classifyError", () => {
  it("ZodError at vision layer → vision_output_invalid", () => {
    const ze = makeZodError();
    const err = classifyError(ze, "vision");
    expect(err.status).toBe("error");
    expect(err.layer).toBe("vision");
    expect(err.reason).toBe("vision_output_invalid");
    expect(err.message).toBeTypeOf("string");
    expect(err.details).toHaveProperty("issues");
  });

  it("ZodError at planner layer → unknown", () => {
    const ze = makeZodError();
    const err = classifyError(ze, "planner");
    expect(err.layer).toBe("planner");
    expect(err.reason).toBe("unknown");
    expect(err.details).toHaveProperty("issues");
  });

  it("VisionApiError → vision_api_failure", () => {
    const err = classifyError(new VisionApiError("api down"), "vision");
    expect(err).toMatchObject({
      status: "error",
      layer: "vision",
      reason: "vision_api_failure",
      message: "api down",
    });
  });

  it("TemplateError → no_usable_template (orchestrator layer)", () => {
    const err = classifyError(new TemplateError("unknown template: foo"), "planner");
    expect(err).toMatchObject({
      status: "error",
      layer: "orchestrator",
      reason: "no_usable_template",
    });
    expect(err.message).toContain("unknown template");
  });

  it("PlannerAbort → planner_slots_unfillable + slotIds detail", () => {
    const err = classifyError(new PlannerAbort(["a", "b"]), "planner");
    expect(err).toMatchObject({
      status: "error",
      layer: "planner",
      reason: "planner_slots_unfillable",
    });
    expect(err.details).toEqual({ slotIds: ["a", "b"] });
  });

  it("InsufficientImages → insufficient_images + have/need detail", () => {
    const err = classifyError(new InsufficientImages(3, 5), "planner");
    expect(err).toMatchObject({
      status: "error",
      layer: "planner",
      reason: "insufficient_images",
    });
    expect(err.details).toEqual({ have: 3, need: 5 });
  });

  it("FfmpegError → renderer_ffmpeg_failure + stderrTail detail", () => {
    const err = classifyError(new FfmpegError("ffmpeg crashed", "tail..."), "renderer");
    expect(err).toMatchObject({
      status: "error",
      layer: "renderer",
      reason: "renderer_ffmpeg_failure",
    });
    expect(err.details).toEqual({ stderrTail: "tail..." });
  });

  it("plain Error → unknown with message preserved", () => {
    const err = classifyError(new Error("boom"), "orchestrator");
    expect(err).toMatchObject({
      status: "error",
      layer: "orchestrator",
      reason: "unknown",
      message: "boom",
    });
  });

  it("non-Error throw → unknown with stringified value", () => {
    const err = classifyError("kaboom", "orchestrator");
    expect(err).toMatchObject({
      status: "error",
      layer: "orchestrator",
      reason: "unknown",
      message: "kaboom",
    });
  });
});

describe("toJobErrorFromToolResult", () => {
  it("returns the JobError when payload has { error: <JobError> }", () => {
    const payload = {
      error: {
        status: "error",
        layer: "vision",
        reason: "vision_api_failure",
        message: "down",
      },
    };
    const got = toJobErrorFromToolResult(payload);
    expect(got).toMatchObject({
      status: "error",
      layer: "vision",
      reason: "vision_api_failure",
      message: "down",
    });
  });

  it("returns null for non-error payloads", () => {
    expect(toJobErrorFromToolResult({ images: [] })).toBeNull();
    expect(toJobErrorFromToolResult(null)).toBeNull();
    expect(toJobErrorFromToolResult("string")).toBeNull();
    expect(toJobErrorFromToolResult({ error: "string" })).toBeNull();
    expect(toJobErrorFromToolResult({ error: { status: "ok" } })).toBeNull();
  });
});
