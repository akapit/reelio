import { ZodError } from "zod";
import type { JobError, Layer } from "../models";
import { VisionApiError } from "../vision/analyzer";
import { FfmpegError } from "../renderer/errors";
import { PlannerAbort, InsufficientImages } from "../planner/fallback";
import { TemplateError } from "../templates/errors";

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "unknown error";
  }
}

export function classifyError(err: unknown, layer: Layer): JobError {
  if (err instanceof ZodError) {
    const reason = layer === "vision" ? "vision_output_invalid" : "unknown";
    return {
      status: "error",
      layer,
      reason,
      message: err.message || "zod validation failed",
      details: { issues: err.issues as unknown as Record<string, unknown>[] },
    };
  }
  if (err instanceof VisionApiError) {
    return {
      status: "error",
      layer: "vision",
      reason: "vision_api_failure",
      message: err.message,
    };
  }
  if (err instanceof TemplateError) {
    return {
      status: "error",
      layer: "orchestrator",
      reason: "no_usable_template",
      message: err.message,
    };
  }
  if (err instanceof PlannerAbort) {
    return {
      status: "error",
      layer: "planner",
      reason: "planner_slots_unfillable",
      message: err.message,
      details: { slotIds: err.slotIds },
    };
  }
  if (err instanceof InsufficientImages) {
    return {
      status: "error",
      layer: "planner",
      reason: "insufficient_images",
      message: err.message,
      details: { have: err.have, need: err.need },
    };
  }
  if (err instanceof FfmpegError) {
    return {
      status: "error",
      layer: "renderer",
      reason: "renderer_ffmpeg_failure",
      message: err.message,
      details: { stderrTail: err.stderrTail ?? "" },
    };
  }
  return {
    status: "error",
    layer,
    reason: "unknown",
    message: describe(err),
  };
}

/**
 * If a tool_result payload carries `{ error: <JobError-shaped> }`, return it.
 * Otherwise return null.
 */
export function toJobErrorFromToolResult(raw: unknown): JobError | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { error?: unknown };
  if (!obj.error || typeof obj.error !== "object") return null;
  const e = obj.error as Partial<JobError>;
  if (e.status !== "error") return null;
  if (typeof e.layer !== "string" || typeof e.reason !== "string") return null;
  return {
    status: "error",
    layer: e.layer as Layer,
    reason: e.reason as JobError["reason"],
    message: typeof e.message === "string" ? e.message : "",
    details: e.details,
  };
}
