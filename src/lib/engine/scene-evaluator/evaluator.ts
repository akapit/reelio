import path from "node:path";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { anthropicCost } from "@/lib/engine/cost/pricing";

import { buildAnthropicImageContent } from "@/lib/engine/llm/anthropicImage";
import type {
  PreparedSceneSource,
  Scene,
  ScenePrompt,
  SceneQualityEvaluation,
  SceneVideo,
} from "@/lib/engine/models";
import { runFfmpeg, runFfprobe } from "@/lib/engine/renderer/ffmpegRun";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a strict QA reviewer for real-estate image-to-video clips.

You are given:
- the prepared source image that the video model saw
- two still frames sampled from the generated clip
- the exact motion prompt used

Your job is to decide whether the scene is good enough to keep, or whether it should be retried once with a better prompt.

Judge on these criteria:
- geometry stability (no warped walls, windows, cabinets, fixtures)
- realism and cleanliness (no melted objects, duplicated furniture, phantom artifacts)
- framing quality (main subject stays well-composed for the target reel)
- motion quality (camera move feels smooth, not chaotic or over-zoomed)
- prompt adherence (the clip matches the intended move and mood)

Be conservative. If the clip looks unstable, generic, or visually broken, fail it.

If retrying, write a replacement prompt that is short, concrete, and more stable than the original. Favor subtle motion, strong composition, and realistic atmosphere. Do not describe room contents beyond what helps framing.

Return ONLY JSON with exactly this shape:
{
  "passed": true | false,
  "score": 0.0,
  "summary": "short sentence",
  "issues": ["..."],
  "retryPrompt": "..." | null,
  "retryReason": "..." | null
}`;

const EvaluationSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  summary: z.string(),
  issues: z.array(z.string()).default([]),
  retryPrompt: z.string().nullable().default(null),
  retryReason: z.string().nullable().default(null),
});

function log(event: string, sceneId: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(
      JSON.stringify({ source: "engine.sceneEvaluator", event, sceneId, ...data }),
    );
  } catch {
    // logging must never throw
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // continue
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      // continue
    }
  }
  return null;
}

function toRecord(x: unknown): Record<string, unknown> | undefined {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : undefined;
}

function pickNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function extractUsage(resp: Anthropic.Message): {
  tokensIn?: number;
  tokensOut?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
} {
  const usage = toRecord(resp.usage);
  if (!usage) return {};
  return {
    tokensIn: pickNumber(usage.input_tokens),
    tokensOut: pickNumber(usage.output_tokens),
    cacheReadTokens: pickNumber(usage.cache_read_input_tokens),
    cacheWriteTokens: pickNumber(usage.cache_creation_input_tokens),
  };
}

function getText(resp: Anthropic.Message): string {
  for (const block of resp.content ?? []) {
    if (block.type === "text") return block.text;
  }
  return "";
}

async function extractFrame(
  videoUrl: string,
  atSec: number,
  label: string,
  scratchDir: string,
): Promise<string> {
  await mkdir(scratchDir, { recursive: true });
  const outPath = path.join(scratchDir, `${label}-${Math.round(atSec * 1000)}.jpg`);
  await runFfmpeg(
    [
      "-y",
      "-ss",
      `${Math.max(0, atSec)}`,
      "-i",
      videoUrl,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outPath,
    ],
    90_000,
  );
  return outPath;
}

function fallbackEvaluation(summary: string): SceneQualityEvaluation {
  return {
    passed: true,
    score: 0.5,
    summary,
    issues: [],
    retryPrompt: null,
    retryReason: null,
    fallbackUsed: true,
    anthropicRequestId: null,
    tokensIn: null,
    tokensOut: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    costUsd: 0,
  };
}

export interface EvaluateSceneVideoInput {
  scene: Scene;
  prompt: ScenePrompt;
  video: SceneVideo;
  preparedSource: PreparedSceneSource;
  client?: Anthropic | { messages: Anthropic["messages"] };
  model?: string;
  scratchDir?: string;
}

export async function evaluateSceneVideo(
  input: EvaluateSceneVideoInput,
): Promise<SceneQualityEvaluation> {
  const client = input.client ?? new Anthropic();
  const model = input.model ?? DEFAULT_MODEL;
  const scratchDir =
    input.scratchDir ??
    path.join(tmpdir(), "engine-scene-evaluator", input.scene.sceneId);

  try {
    const probe = await runFfprobe(input.video.videoUrl);
    // Three sample points across the clip. Late-clip artifacts (morphing at
    // the end of a Kling motion beat, end-of-tween flicker) are a known
    // failure mode that two-frame sampling missed — the third frame catches
    // them. Each time is clamped so we never seek past the end.
    const earlyTime = Math.min(0.4, Math.max(probe.durationSec * 0.15, 0.1));
    const midTime = Math.max(earlyTime + 0.2, probe.durationSec * 0.6);
    const lateTime = Math.max(
      midTime + 0.1,
      Math.min(probe.durationSec - 0.1, probe.durationSec * 0.85),
    );
    const earlyFrame = await extractFrame(
      input.video.videoUrl,
      earlyTime,
      "early",
      scratchDir,
    );
    const midFrame = await extractFrame(
      input.video.videoUrl,
      Math.min(midTime, Math.max(probe.durationSec - 0.1, earlyTime + 0.1)),
      "mid",
      scratchDir,
    );
    const lateFrame = await extractFrame(
      input.video.videoUrl,
      Math.min(lateTime, Math.max(probe.durationSec - 0.05, midTime + 0.1)),
      "late",
      scratchDir,
    );

    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text:
          `Scene ${input.scene.order} (${input.scene.sceneRole})\n` +
          `Duration: ${input.scene.durationSec}s\n` +
          `Motion intent: ${input.scene.motionIntent}\n` +
          `Prompt used: ${input.prompt.prompt}\n` +
          `Model choice: ${input.prompt.modelChoice}\n` +
          `Review the source image and the sampled output frames.`,
      },
      {
        type: "text",
        text: "Prepared source image shown to the video model:",
      },
      await buildAnthropicImageContent(input.preparedSource.providerImageUrl),
      {
        type: "text",
        text: `Generated frame near ${earlyTime.toFixed(2)}s:`,
      },
      await buildAnthropicImageContent(earlyFrame),
      {
        type: "text",
        text: `Generated frame near ${Math.min(midTime, probe.durationSec).toFixed(2)}s:`,
      },
      await buildAnthropicImageContent(midFrame),
      {
        type: "text",
        text: `Generated frame near ${Math.min(lateTime, probe.durationSec).toFixed(2)}s (end-of-clip — watch for morphing/flicker):`,
      },
      await buildAnthropicImageContent(lateFrame),
    ];

    const response = await client.messages.create({
      model,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: content as any,
        },
      ],
    } as any);

    const responseRecord = toRecord(response);
    const requestId =
      responseRecord && typeof responseRecord.id === "string"
        ? responseRecord.id
        : null;
    const usage = extractUsage(response);
    const text = getText(response);
    const parsed = EvaluationSchema.safeParse(extractJson(text));

    if (!parsed.success) {
      log("evaluate.invalidJson", input.scene.sceneId, {
        rawPreview: text.slice(0, 300),
      });
      return fallbackEvaluation("Scene evaluation unavailable; kept original clip.");
    }

    log("evaluate.done", input.scene.sceneId, {
      passed: parsed.data.passed,
      score: parsed.data.score,
      requestId,
    });

    const evalCostUsd = anthropicCost({
      model: DEFAULT_MODEL,
      inputTokens: usage.tokensIn,
      outputTokens: usage.tokensOut,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    });
    return {
      ...parsed.data,
      fallbackUsed: false,
      anthropicRequestId: requestId,
      tokensIn: usage.tokensIn ?? null,
      tokensOut: usage.tokensOut ?? null,
      cacheReadTokens: usage.cacheReadTokens ?? null,
      cacheWriteTokens: usage.cacheWriteTokens ?? null,
      costUsd: evalCostUsd,
    };
  } catch (error) {
    log("evaluate.failed", input.scene.sceneId, {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackEvaluation("Scene evaluation unavailable; kept original clip.");
  }
}
