/**
 * Claude VLM-based image quality triage.
 *
 * Given a batch of source images (paths + bytes), classify each as usable or
 * not. "Usable" means good enough to put in a real-estate listing video.
 * Unusable cases: blurry / out of focus, severely under/over-exposed, heavy
 * watermark or text overlay, not actually real-estate (selfie, document,
 * screenshot), badly cluttered, strongly tilted / skewed.
 *
 * Design:
 *   - One Claude call per run, all images in the same user message. Saves
 *     request count (kie.ai / Anthropic rate limits) and gives the model
 *     cross-image context so it can be consistent about the bar.
 *   - System prompt is static and wrapped in `cache_control: ephemeral` so
 *     subsequent runs reuse cached tokens.
 *   - On any failure (network, invalid JSON after one retry, API error), fall
 *     back to `{ usable: true }` for every image — never block a generation
 *     on an infra blip, and surface a warning via `fallbackUsed=true`.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { anthropicCost } from "../cost/pricing";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You judge whether real-estate listing photos are usable in a property video.

You will receive an ordered list of images, numbered 1..N. For each image, decide:
- usable: true if the photo is acceptable to use in a listing video.
- usable: false ONLY if the photo is clearly unfit for use. Typical reasons:
  - blurry or out of focus
  - severely underexposed (too dark to read) or overexposed (blown out)
  - dominant watermark, logo, or burned-in text
  - not actually a real-estate photo (selfie, document, screenshot, random object)
  - heavily cluttered / messy to the point of looking unprofessional
  - strongly tilted / skewed / distorted
- reason: a short 1-5 word human-readable tag when !usable (e.g. "blurry", "watermark", "dark", "not real estate"). Omit when usable.

Be pragmatic. A dim but readable room photo is usable. A slightly tilted photo is usable. Mark false only when the photo is genuinely not suitable.

Return ONLY a JSON object with exactly this shape, one entry per image, preserving index order:
{
  "verdicts": [
    { "index": 1, "usable": true },
    { "index": 2, "usable": false, "reason": "blurry" },
    ...
  ]
}`;

export interface QualityVerdict {
  usable: boolean;
  reason?: string;
}

export interface CheckImageQualityInput {
  images: Array<{ path: string; bytes: Buffer }>;
  /** Optional dep injection for tests. */
  client?: Anthropic | { messages: Anthropic["messages"] };
  model?: string;
}

export interface CheckImageQualityResult {
  /** Map keyed on image path → verdict. */
  verdicts: Map<string, QualityVerdict>;
  fallbackUsed: boolean;
  anthropicRequestId?: string;
  tokensIn?: number;
  tokensOut?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Estimated USD cost across all chunks. 0 when no calls were made. */
  costUsd: number;
}

const VerdictSchema = z.object({
  index: z.number().int().positive(),
  usable: z.boolean(),
  reason: z.string().optional(),
});

const ResponseSchema = z.object({
  verdicts: z.array(VerdictSchema),
});

function log(event: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(JSON.stringify({ source: "engine.vision.qc", event, ...data }));
  } catch {
    /* never throw from logging */
  }
}

function inferMediaType(imagePath: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Claude's image API hard-caps base64 payloads at 5 MB (decoded bytes), which
 * real estate photos from modern phones routinely exceed (iPhone JPEGs run
 * 4-8 MB). Pick the best `source` form for each image:
 *
 *   - If the path is an http(s) URL (it is for R2-hosted source images), use
 *     `type: "url"`. The API fetches the URL server-side and the 5 MB base64
 *     cap does not apply; effective limit is ~20 MB.
 *   - Otherwise (local test fixture, or bytes we've already downscaled),
 *     use `type: "base64"`. If the bytes would exceed the base64 cap we can
 *     add a resize step here, but that path is rare in production.
 */
function buildImageBlock(image: {
  path: string;
  bytes: Buffer;
}): Record<string, unknown> {
  if (isHttpUrl(image.path)) {
    return {
      type: "image",
      source: {
        type: "url",
        url: image.path,
      },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: inferMediaType(image.path),
      data: image.bytes.toString("base64"),
    },
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      /* give up */
    }
  }
  return null;
}

/** Maximum images per Claude call. Above this we split into chunks to keep
 *  the prompt reasonable and avoid hitting token caps. */
const BATCH_SIZE = 8;

export async function checkImageQuality(
  input: CheckImageQualityInput,
): Promise<CheckImageQualityResult> {
  const { images, model = DEFAULT_MODEL } = input;
  if (images.length === 0) {
    return { verdicts: new Map(), fallbackUsed: false, costUsd: 0 };
  }

  const client: Anthropic | { messages: Anthropic["messages"] } =
    input.client ?? new Anthropic();

  const allVerdicts = new Map<string, QualityVerdict>();
  let anyFallback = false;
  let anthropicRequestId: string | undefined;
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;

  for (let chunkStart = 0; chunkStart < images.length; chunkStart += BATCH_SIZE) {
    const chunk = images.slice(chunkStart, chunkStart + BATCH_SIZE);

    log("call.start", { chunkStart, chunkSize: chunk.length, model });

    // Build the user message: a text header + one image per entry.
    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Judge these ${chunk.length} real-estate photos (indexed 1..${chunk.length}). Return the JSON contract.`,
      },
    ];
    for (let i = 0; i < chunk.length; i++) {
      content.push({
        type: "text",
        text: `Image ${i + 1}:`,
      });
      content.push(buildImageBlock(chunk[i]));
    }

    const params = {
      model,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content }],
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp = (await client.messages.create(params as any)) as Anthropic.Message;

      // Usage metrics.
      const usage = resp.usage as
        | {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          }
        | undefined;
      tokensIn += usage?.input_tokens ?? 0;
      tokensOut += usage?.output_tokens ?? 0;
      cacheReadTokens += usage?.cache_read_input_tokens ?? 0;
      cacheWriteTokens += usage?.cache_creation_input_tokens ?? 0;

      const respRec = resp as unknown as { id?: string };
      if (!anthropicRequestId && typeof respRec.id === "string") {
        anthropicRequestId = respRec.id;
      }

      // Extract text content.
      let text = "";
      for (const block of resp.content ?? []) {
        if (block.type === "text") text += block.text;
      }

      const parsed = extractJson(text);
      const validation = ResponseSchema.safeParse(parsed);

      if (!validation.success) {
        log("call.validationFailed", {
          chunkStart,
          error: validation.error.message,
          rawPreview: text.slice(0, 200),
        });
        // Fallback: mark this chunk all-usable.
        for (const img of chunk) allVerdicts.set(img.path, { usable: true });
        anyFallback = true;
        continue;
      }

      // Map 1-indexed verdicts to image paths.
      const byIndex = new Map<number, z.infer<typeof VerdictSchema>>();
      for (const v of validation.data.verdicts) byIndex.set(v.index, v);
      for (let i = 0; i < chunk.length; i++) {
        const v = byIndex.get(i + 1);
        if (!v) {
          // Missing verdict for this image — treat as usable (conservative).
          allVerdicts.set(chunk[i].path, { usable: true });
          anyFallback = true;
          continue;
        }
        allVerdicts.set(chunk[i].path, {
          usable: v.usable,
          ...(v.reason && !v.usable ? { reason: v.reason } : {}),
        });
      }

      log("call.ok", {
        chunkStart,
        chunkSize: chunk.length,
        unusable: validation.data.verdicts.filter((v) => !v.usable).length,
      });
    } catch (err) {
      log("call.error", {
        chunkStart,
        error: err instanceof Error ? err.message : String(err),
      });
      for (const img of chunk) allVerdicts.set(img.path, { usable: true });
      anyFallback = true;
    }
  }

  return {
    verdicts: allVerdicts,
    fallbackUsed: anyFallback,
    anthropicRequestId,
    tokensIn: tokensIn || undefined,
    tokensOut: tokensOut || undefined,
    cacheReadTokens: cacheReadTokens || undefined,
    cacheWriteTokens: cacheWriteTokens || undefined,
    costUsd: anthropicCost({
      model,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      cacheReadTokens,
      cacheWriteTokens,
    }),
  };
}
