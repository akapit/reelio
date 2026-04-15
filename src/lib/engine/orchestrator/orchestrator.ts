import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  Message,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { TOOLS, executeTool as defaultExecuteTool } from "./tools";
import { classifyError, toJobErrorFromToolResult } from "./errors";
import {
  ImageDataset,
  JobError,
  JobResult,
  RenderResult,
  TimelineBlueprint,
} from "../models";

export interface RunEngineRequest {
  imagePaths: string[];
  templateName: string;
  outputPath: string;
}

export interface RunEngineDeps {
  client?: Pick<Anthropic, "messages">;
  executeTool?: typeof defaultExecuteTool;
  model?: string;
  maxIterations?: number;
}

interface Locals {
  dataset?: ImageDataset;
  timeline?: TimelineBlueprint;
  render?: RenderResult;
}

function log(event: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(JSON.stringify({ source: "engine.orchestrator", event, ...data }));
  } catch {
    // never throw from logging
  }
}

function isErrorEnvelope(raw: unknown): boolean {
  return toJobErrorFromToolResult(raw) !== null;
}

function captureLocal(name: string, raw: unknown, locals: Locals): void {
  if (isErrorEnvelope(raw)) return;

  if (name === "analyze_images") {
    const parsed = ImageDataset.safeParse(raw);
    if (parsed.success) locals.dataset = parsed.data;
    return;
  }
  if (name === "build_timeline") {
    // PlannerAbort signal — not a timeline.
    if (
      raw &&
      typeof raw === "object" &&
      "abortedSlotIds" in (raw as object) &&
      !("shots" in (raw as object))
    ) {
      return;
    }
    const parsed = TimelineBlueprint.safeParse(raw);
    if (parsed.success) locals.timeline = parsed.data;
    return;
  }
  if (name === "render_video") {
    const parsed = RenderResult.safeParse(raw);
    if (parsed.success) locals.render = parsed.data;
    return;
  }
}

function lastTextOf(content: ContentBlock[] | undefined): string {
  if (!content) return "";
  for (let i = content.length - 1; i >= 0; i--) {
    const b = content[i];
    if (b.type === "text") return b.text;
  }
  return "";
}

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function synthesizeJobResult(
  locals: Locals,
  outputPath: string,
  startedAt: number,
): JobResult | null {
  if (!locals.dataset || !locals.timeline || !locals.render) return null;
  const candidate: JobResult = {
    status: "success",
    videoPath: locals.render.outputPath || outputPath,
    timeline: locals.timeline,
    dataset: locals.dataset,
    render: locals.render,
    totalMs: Date.now() - startedAt,
  };
  const parsed = JobResult.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export async function runEngineJob(
  req: RunEngineRequest,
  deps: RunEngineDeps = {},
): Promise<JobResult | JobError> {
  const startedAt = Date.now();
  const model =
    deps.model ?? process.env.ENGINE_ORCHESTRATOR_MODEL ?? "claude-opus-4-6";
  const maxIterations = deps.maxIterations ?? 10;
  const exec = deps.executeTool ?? defaultExecuteTool;

  const client: Pick<Anthropic, "messages"> =
    deps.client ?? (new Anthropic() as unknown as Pick<Anthropic, "messages">);

  const messages: MessageParam[] = [
    {
      role: "user",
      content: JSON.stringify({
        image_paths: req.imagePaths,
        template_name: req.templateName,
        output_path: req.outputPath,
      }),
    },
  ];

  const locals: Locals = {};

  log("run.start", {
    model,
    maxIterations,
    imageCount: req.imagePaths.length,
    templateName: req.templateName,
  });

  for (let i = 0; i < maxIterations; i++) {
    let resp: Message;
    try {
      resp = (await client.messages.create({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOLS as unknown as Tool[],
        messages,
      })) as Message;
    } catch (err) {
      log("anthropic.error", {
        i,
        message: err instanceof Error ? err.message : String(err),
      });
      return classifyError(err, "orchestrator");
    }

    const stopReason = resp.stop_reason ?? null;
    const toolUses = (resp.content ?? []).filter(
      (b): b is ToolUseBlock => b.type === "tool_use",
    );
    log("iter.end", {
      i,
      stopReason,
      toolsCalled: toolUses.map((t) => t.name),
    });

    // Append the assistant message into the running transcript.
    messages.push({
      role: "assistant",
      content: resp.content as MessageParam["content"],
    });

    if (stopReason === "end_turn") {
      const text = lastTextOf(resp.content);
      const parsed = tryParseJson(text);

      if (parsed && typeof parsed === "object") {
        const errParse = JobError.safeParse(parsed);
        if (errParse.success) {
          log("run.end", { outcome: "error", reason: errParse.data.reason });
          return errParse.data;
        }
        // Try as JobResult; substitute locals when available (authoritative).
        const okParse = JobResult.safeParse(parsed);
        if (okParse.success) {
          if (locals.dataset && locals.timeline && locals.render) {
            const synthesized: JobResult = {
              status: "success",
              videoPath: locals.render.outputPath || req.outputPath,
              timeline: locals.timeline,
              dataset: locals.dataset,
              render: locals.render,
              totalMs: Date.now() - startedAt,
            };
            log("run.end", { outcome: "success", resultSource: "synthesized" });
            return synthesized;
          }
          // No locals to substitute — trust model and recompute totalMs.
          const out: JobResult = {
            ...okParse.data,
            totalMs: Date.now() - startedAt,
          };
          log("run.end", { outcome: "success", resultSource: "model" });
          return out;
        }
      }

      // Final message couldn't be parsed as JobResult or JobError.
      // If we have all locals, synthesize success anyway.
      const synth = synthesizeJobResult(locals, req.outputPath, startedAt);
      if (synth) {
        log("run.end", { outcome: "success", resultSource: "synthesized.fallback" });
        return synth;
      }

      return classifyError(
        new Error(`unparseable final content: ${text.slice(0, 200)}`),
        "orchestrator",
      );
    }

    if (stopReason !== "tool_use") {
      // Try synthesizing from locals before giving up.
      const synth = synthesizeJobResult(locals, req.outputPath, startedAt);
      if (synth) {
        log("run.end", {
          outcome: "success",
          resultSource: "synthesized.unexpected_stop",
          stopReason,
        });
        return synth;
      }
      return {
        status: "error",
        layer: "orchestrator",
        reason: "unknown",
        message: `unexpected stop_reason: ${stopReason}`,
      };
    }

    // tool_use: execute every tool_use block in this assistant turn.
    if (toolUses.length === 0) {
      return {
        status: "error",
        layer: "orchestrator",
        reason: "unknown",
        message: "tool_use stop_reason but no tool_use blocks",
      };
    }

    const toolResults: ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let result: unknown;
      try {
        result = await exec(tu.name, tu.input);
      } catch (err) {
        result = { error: classifyError(err, "orchestrator") };
      }
      captureLocal(tu.name, result, locals);
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
        is_error: isErrorEnvelope(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  log("run.end", { outcome: "timeout", iterations: maxIterations });
  return {
    status: "error",
    layer: "orchestrator",
    reason: "timeout",
    message: `exceeded maxIterations=${maxIterations}`,
  };
}
