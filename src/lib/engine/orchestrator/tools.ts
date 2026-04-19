import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import {
  ImageDataset,
  TimelineBlueprint,
  type JobError,
} from "../models";
import { analyzeImages } from "../vision/analyzer";
import { buildTimeline } from "../planner/planner";
import { InsufficientImages } from "../planner/fallback";
import { renderVideo } from "../renderer/renderer";
import { FfmpegError } from "../renderer/errors";
import { loadTemplate } from "../templates/loader";
import { TemplateError } from "../templates/errors";
import { classifyError } from "./errors";

export const TOOLS: Tool[] = [
  {
    name: "analyze_images",
    description:
      "Run computer-vision analysis on every supplied image path and return a structured ImageDataset (per-image scores, room types, eligibility, and an aggregate usableCount). Always invoke this first; never skip.",
    input_schema: {
      type: "object",
      properties: {
        image_paths: {
          type: "array",
          items: { type: "string" },
          description: "Absolute or fetchable URLs of the source images.",
        },
      },
      required: ["image_paths"],
    },
  },
  {
    name: "build_timeline",
    description:
      "Given an ImageDataset and a template name, produce a deterministic TimelineBlueprint. Returns either { ...TimelineBlueprint } on success or { abortedSlotIds: string[] } when one or more required slots could not be filled.",
    input_schema: {
      type: "object",
      properties: {
        dataset: {
          type: "object",
          description: "The ImageDataset returned from analyze_images, passed through unchanged.",
        },
        template_name: {
          type: "string",
          description: "One of: luxury_30s, family_30s, fast_15s, investor_20s, premium_45s.",
        },
      },
      required: ["dataset", "template_name"],
    },
  },
  {
    name: "render_video",
    description:
      "Render the TimelineBlueprint to an MP4 at output_path using ffmpeg. Returns a RenderResult { outputPath, durationSec, sizeBytes, width, height, codec, renderMs }.",
    input_schema: {
      type: "object",
      properties: {
        timeline: {
          type: "object",
          description: "The TimelineBlueprint returned from build_timeline, passed through unchanged.",
        },
        output_path: {
          type: "string",
          description: "Absolute filesystem path where the final MP4 will be written.",
        },
      },
      required: ["timeline", "output_path"],
    },
  },
];

type ErrorEnvelope = { error: JobError };

function errorEnvelope(err: JobError): ErrorEnvelope {
  return { error: err };
}

export async function executeTool(
  name: string,
  input: unknown,
): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;

  if (name === "analyze_images") {
    const paths = args.image_paths;
    if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) {
      return errorEnvelope({
        status: "error",
        layer: "orchestrator",
        reason: "unknown",
        message: "analyze_images: image_paths must be string[]",
      });
    }
    try {
      const dataset = await analyzeImages(paths as string[]);
      return dataset;
    } catch (err) {
      return errorEnvelope(classifyError(err, "vision"));
    }
  }

  if (name === "build_timeline") {
    const datasetParse = ImageDataset.safeParse(args.dataset);
    if (!datasetParse.success) {
      return errorEnvelope({
        status: "error",
        layer: "vision",
        reason: "vision_output_invalid",
        message: datasetParse.error.message,
        details: {
          issues: datasetParse.error.issues as unknown as Record<string, unknown>[],
        },
      });
    }
    const templateName = args.template_name;
    if (typeof templateName !== "string") {
      return errorEnvelope({
        status: "error",
        layer: "orchestrator",
        reason: "no_usable_template",
        message: "build_timeline: template_name must be a string",
      });
    }
    let template;
    try {
      template = loadTemplate(templateName);
    } catch (err) {
      if (err instanceof TemplateError) {
        return errorEnvelope({
          status: "error",
          layer: "orchestrator",
          reason: "no_usable_template",
          message: err.message,
        });
      }
      return errorEnvelope(classifyError(err, "orchestrator"));
    }
    try {
      const result = buildTimeline(datasetParse.data, template);
      // PlannerAbort signal — pass through verbatim (NOT an error envelope).
      if (
        result &&
        typeof result === "object" &&
        "abortedSlotIds" in (result as object)
      ) {
        return result;
      }
      return result;
    } catch (err) {
      if (err instanceof InsufficientImages) {
        return errorEnvelope({
          status: "error",
          layer: "planner",
          reason: "insufficient_images",
          message: err.message,
          details: { have: err.have, need: err.need },
        });
      }
      return errorEnvelope(classifyError(err, "planner"));
    }
  }

  if (name === "render_video") {
    const tlParse = TimelineBlueprint.safeParse(args.timeline);
    if (!tlParse.success) {
      // Zod validation here is upstream-bad-data — not something the renderer
      // can actually fix, so classify as `unknown` per spec.
      return errorEnvelope({
        status: "error",
        layer: "renderer",
        reason: "unknown",
        message: tlParse.error.message,
        details: {
          issues: tlParse.error.issues as unknown as Record<string, unknown>[],
        },
      });
    }
    const outputPath = args.output_path;
    if (typeof outputPath !== "string") {
      return errorEnvelope({
        status: "error",
        layer: "orchestrator",
        reason: "unknown",
        message: "render_video: output_path must be a string",
      });
    }
    try {
      const result = await renderVideo(tlParse.data, outputPath);
      return result;
    } catch (err) {
      if (err instanceof FfmpegError) {
        return errorEnvelope({
          status: "error",
          layer: "renderer",
          reason: "renderer_ffmpeg_failure",
          message: err.message,
          details: { stderrTail: err.stderrTail ?? "" },
        });
      }
      return errorEnvelope(classifyError(err, "renderer"));
    }
  }

  return errorEnvelope({
    status: "error",
    layer: "orchestrator",
    reason: "unknown",
    message: `unknown tool: ${name}`,
  });
}
