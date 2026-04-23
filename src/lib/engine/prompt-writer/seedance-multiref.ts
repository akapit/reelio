/**
 * Seedance multi-ref prompt writer — single-call path.
 *
 * This is the prompt-writer counterpart for the "seedance mode" flow, where we
 * ship ALL reference images (<= 9) to ByteDance Seedance 2 in one
 * `generateVideo` call and let Seedance produce a single 15s walkthrough.
 *
 * Unlike the scene-based writer (writer.ts) which emits N short per-scene
 * prompts to Kling/Seedance, this writer emits ONE longer time-segmented
 * prompt that binds @image1..@imageN to explicit roles (first frame, scene
 * refs, closing shot) across a 4-15s timeline. Follows the Jimeng Seedance 2.0
 * prompting conventions (see dexhunter/seedance2-skill): role assignment on
 * every @reference, camera verbs, timed segments, audio direction.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildAnthropicImageContent } from "@/lib/engine/llm/anthropicImage";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MIN_DURATION = 4;
const MAX_DURATION = 15;
const MAX_IMAGES = 9;

/** Lightweight vision summary per image — whatever we can get from GCV. */
export interface SeedanceImageAnalysis {
  /** Classified room type (e.g. "living_room", "kitchen", "exterior"). */
  roomType?: string;
  /** Top few label strings from GCV (e.g. "couch", "window", "chandelier"). */
  labels?: string[];
}

export interface WriteSeedanceMultirefInput {
  /** Reference image URLs or local paths (input order). Claude will decide
   *  the final sequence via the emitted `order` array. */
  imageUrls: string[];
  /** Optional per-image vision metadata, same length and order as imageUrls.
   *  Feeds Claude's ordering reasoning without requiring it to re-analyze. */
  imageAnalyses?: SeedanceImageAnalysis[];
  /** Target video duration in seconds. Clamped to [4, 15]. */
  durationSec?: number;
  /** Aspect ratio hint ("16:9" | "9:16" | "1:1"). */
  aspectRatio?: "16:9" | "9:16" | "1:1";
  /** Short mood hint, e.g. template name or user-supplied tone. */
  mood?: string;
  /** If a voiceover is planned, hand the script to the writer so it can
   *  pace visuals against the narration. */
  voiceoverText?: string;
  /** If background music is planned, the style hint. */
  musicPrompt?: string;
  /** Optional dep-inject for tests. */
  client?: Anthropic | { messages: Anthropic["messages"] };
  model?: string;
}

export interface WriteSeedanceMultirefResult {
  /**
   * Permutation of [0..imageUrls.length-1]. `order[k]` is the INPUT index
   * of the image that should appear at position k+1 in the final video
   * (i.e. bound to @image(k+1) inside `prompt`). Callers must reorder
   * `reference_image_urls` by this array before calling Seedance.
   */
  order: number[];
  prompt: string;
  anthropicRequestId?: string;
  tokensIn?: number;
  tokensOut?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** true if the LLM failed and we used a deterministic fallback. */
  fallbackUsed: boolean;
}

const SYSTEM_PROMPT = `You plan and write TERSE prompts for ByteDance Seedance 2
real-estate walkthroughs.

## Two jobs, one response
You do BOTH in a single JSON response:
  1. Choose the best ORDER for the attached images (they arrive in the
     user's upload order, which is often not the best narrative order).
  2. Write a terse camera-direction prompt over the NEW order.

## Output contract
{ "order": [<input_index>, <input_index>, ...], "prompt": "<prompt>" }

Rules for "order":
- Must be a permutation of 0..N-1 (each input image appears exactly once).
- Zero-indexed over the INPUT order in which images were attached.
- The first entry is the opening shot. The last entry is the closing shot.
- @imageK in "prompt" refers to the NEW position (1-based) AFTER reorder,
  NOT the input index. So @image1 is the first entry of your "order"
  array, @image2 is the second, etc.

No prose, no markdown, no code fences — JSON only.

## Ordering heuristics
- Strong opener: exterior / facade / hero-wide-living / panoramic view.
  Something that establishes "this is the property".
- Logical interior flow: living/lounge → kitchen/dining → bedrooms →
  bathrooms/closets → terrace/outdoor.
- Strong closer: panoramic view, master suite, dusk exterior, or a wide
  hero shot. Avoid ending on a bathroom or closet.
- If two images are very similar (same room, similar angle), keep them
  adjacent so the transition reads as continuity.
- If the user supplied a "Room hints" block below, use it to inform the
  order. Otherwise rely on your own look at the images.

## Prompt rules — keep it short
- Total prompt length: 30-70 words. NEVER exceed 80.
- Only TWO kinds of content:
    1. An entrance move on @image1.
    2. A transition verb + the next @imageK.
  Nothing else. No lighting, no adjectives, no mood, no atmosphere, no
  "cinematic quality", no "shallow depth of field", no descriptions of
  what's in the images. Seedance already sees them.

## Shape (for N images after reorder)
"<entrance> on @image1. <transition> to @image2. <transition> to @image3.
 ... <closing transition> to @imageN."

Every @imageK appears exactly once.

## Entrance verbs (pick ONE)
push-in, pull-back, rise, descend, tracking-right, tracking-left,
orbit-right, orbit-left.

## Transition verbs (vary them — do not repeat consecutively)
cut, whip-pan, dolly-through, tracking-right, tracking-left, pan-right,
pan-left, tilt-up, tilt-down, crossfade, push-through.

## Audio direction
If the caller notes voiceover or music, add ONE short trailing sentence
("Background music: warm ambient." or "Paced for narration."). Otherwise
add nothing.

## Do NOT
- Do NOT describe rooms, lighting, furniture, materials, colors, or mood.
- Do NOT add "warm afternoon light", "confident", "flowing", etc.
- Do NOT time-segment ("0-3s:", "3-6s:"). No timestamps.
- Do NOT output multiple sentences per image.

## Good example
Input: 5 images uploaded in order [bathroom, exterior, kitchen, living, bedroom].
Output:
{
  "order": [1, 3, 2, 4, 0],
  "prompt": "Push-in on @image1. Dolly-through to @image2. Pan-right to @image3. Tilt-up to @image4. Crossfade to @image5."
}
`;

const LLMResponseSchema = z.object({
  order: z.array(z.number().int().nonnegative()),
  prompt: z.string().min(1),
});

/** Validate that `order` is a permutation of [0..n-1]. */
function isValidPermutation(order: number[], n: number): boolean {
  if (order.length !== n) return false;
  const seen = new Set<number>();
  for (const idx of order) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= n) return false;
    if (seen.has(idx)) return false;
    seen.add(idx);
  }
  return true;
}

/** Identity permutation [0, 1, ..., n-1]. */
function identityOrder(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function log(event: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(
      JSON.stringify({ source: "engine.seedanceMultiref", event, ...data }),
    );
  } catch {
    /* never throw from logging */
  }
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

function fallbackPrompt(
  imageCount: number,
  _durationSec: number,
  _mood?: string,
  voiceoverText?: string,
  musicPrompt?: string,
): string {
  // Terse entrance + transitions. One line, no adjectives, no timestamps.
  const transitions = [
    "Whip-pan",
    "Tracking-right",
    "Pan-right",
    "Tilt-up",
    "Dolly-through",
    "Crossfade",
    "Tracking-left",
    "Push-through",
  ];
  const parts: string[] = [`Push-in on @image1.`];
  for (let i = 1; i < imageCount; i++) {
    const verb = transitions[(i - 1) % transitions.length];
    parts.push(`${verb} to @image${i + 1}.`);
  }
  let out = parts.join(" ");
  if (voiceoverText) out += " Paced for narration.";
  else if (musicPrompt) out += " Background music: warm ambient.";
  return out;
}

function toRecord(x: unknown): Record<string, unknown> | undefined {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : undefined;
}

function pickNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

export async function writeSeedanceMultirefPrompt(
  input: WriteSeedanceMultirefInput,
): Promise<WriteSeedanceMultirefResult> {
  const rawDuration = input.durationSec ?? 15;
  const durationSec = Math.min(
    MAX_DURATION,
    Math.max(MIN_DURATION, Math.round(rawDuration)),
  );
  const imageUrls = input.imageUrls.slice(0, MAX_IMAGES);
  const model = input.model ?? DEFAULT_MODEL;

  if (imageUrls.length === 0) {
    throw new Error("writeSeedanceMultirefPrompt: imageUrls must not be empty");
  }

  const client: Anthropic | { messages: Anthropic["messages"] } =
    input.client ?? new Anthropic();

  const briefLines = [
    `Images: ${imageUrls.length} (you will reorder; @imageK refers to the NEW position).`,
    `Duration: ${durationSec}s.`,
    input.voiceoverText ? `Voiceover: yes.` : null,
    input.musicPrompt ? `Music: yes.` : null,
  ]
    .filter((x): x is string => !!x)
    .join(" ");

  // Room hints — one line per input image, so Claude can ground its
  // ordering decision in the structured vision output rather than only
  // eyeballing thumbnails. Presented alongside the interleaved images
  // below.
  const roomHints = input.imageAnalyses?.length
    ? input.imageAnalyses
        .slice(0, imageUrls.length)
        .map((a, i) => {
          const labels = (a.labels ?? []).slice(0, 4).join(", ");
          const room = a.roomType ?? "unclassified";
          return `  input[${i}] -> ${room}${labels ? ` (labels: ${labels})` : ""}`;
        })
        .join("\n")
    : null;

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        `${briefLines}\n\n` +
        (roomHints ? `Room hints (input-index order):\n${roomHints}\n\n` : "") +
        `Decide "order" (permutation of 0..${imageUrls.length - 1}), then write ` +
        `the terse prompt over the reordered sequence. Reference images follow ` +
        `in INPUT order — input[0] is first, input[1] second, and so on.`,
    },
  ];

  for (let i = 0; i < imageUrls.length; i++) {
    userContent.push({
      type: "text",
      text: `input[${i}]:`,
    });
    try {
      userContent.push(await buildAnthropicImageContent(imageUrls[i]));
    } catch (err) {
      userContent.push({
        type: "text",
        text: `(reference unavailable: ${
          err instanceof Error ? err.message : String(err)
        })`,
      });
    }
  }

  log("call.start", {
    model,
    imageCount: imageUrls.length,
    durationSec,
    hasVoiceover: !!input.voiceoverText,
    hasMusic: !!input.musicPrompt,
  });

  async function callAnthropic(
    extras: Array<{
      role: "user" | "assistant";
      content: string | Array<Record<string, unknown>>;
    }> = [],
  ): Promise<Anthropic.Message> {
    const params = {
      model,
      max_tokens: 400,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        { role: "user", content: userContent },
        ...extras,
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return client.messages.create(params as any) as Promise<Anthropic.Message>;
  }

  function extractUsage(resp: Anthropic.Message) {
    const u = toRecord(resp.usage);
    return {
      tokensIn: pickNumber(u?.input_tokens),
      tokensOut: pickNumber(u?.output_tokens),
      cacheReadTokens: pickNumber(u?.cache_read_input_tokens),
      cacheWriteTokens: pickNumber(u?.cache_creation_input_tokens),
    };
  }

  function getText(resp: Anthropic.Message): string {
    for (const block of resp.content ?? []) {
      if (block.type === "text") return block.text;
    }
    return "";
  }

  let usage = {
    tokensIn: undefined as number | undefined,
    tokensOut: undefined as number | undefined,
    cacheReadTokens: undefined as number | undefined,
    cacheWriteTokens: undefined as number | undefined,
  };
  let anthropicRequestId: string | undefined;

  try {
    const resp = await callAnthropic();
    usage = extractUsage(resp);
    const respRec = toRecord(resp);
    anthropicRequestId =
      respRec && typeof respRec.id === "string" ? respRec.id : undefined;

    const text = getText(resp);
    const parsed = extractJson(text);
    const validated = LLMResponseSchema.safeParse(parsed);

    if (
      validated.success &&
      isValidPermutation(validated.data.order, imageUrls.length)
    ) {
      log("call.success", {
        model,
        imageCount: imageUrls.length,
        promptLength: validated.data.prompt.length,
        order: validated.data.order,
        ...usage,
      });
      return {
        order: validated.data.order,
        prompt: validated.data.prompt,
        anthropicRequestId,
        ...usage,
        fallbackUsed: false,
      };
    }

    log("call.validationFailed", {
      model,
      attempt: 1,
      error: validated.success
        ? `order is not a valid permutation of 0..${imageUrls.length - 1}`
        : validated.error.message,
      rawPreview: text.slice(0, 300),
    });

    // One retry with a stricter nudge.
    const retryResp = await callAnthropic([
      { role: "assistant", content: text },
      {
        role: "user",
        content:
          'Your previous reply failed validation. Return ONLY {"order":[...],"prompt":"..."} ' +
          "with no prose, no markdown, no code fences. `order` must be a permutation of " +
          `0..${imageUrls.length - 1} (each input index exactly once). ` +
          "`prompt` must be 30-70 words, one entrance verb on @image1 and one transition verb " +
          "to each subsequent @imageK.",
      },
    ]);
    const retryUsage = extractUsage(retryResp);
    usage = {
      tokensIn:
        retryUsage.tokensIn !== undefined
          ? (usage.tokensIn ?? 0) + retryUsage.tokensIn
          : usage.tokensIn,
      tokensOut:
        retryUsage.tokensOut !== undefined
          ? (usage.tokensOut ?? 0) + retryUsage.tokensOut
          : usage.tokensOut,
      cacheReadTokens: retryUsage.cacheReadTokens ?? usage.cacheReadTokens,
      cacheWriteTokens: retryUsage.cacheWriteTokens ?? usage.cacheWriteTokens,
    };

    const retryText = getText(retryResp);
    const retryParsed = extractJson(retryText);
    const retryValidated = LLMResponseSchema.safeParse(retryParsed);
    if (
      retryValidated.success &&
      isValidPermutation(retryValidated.data.order, imageUrls.length)
    ) {
      log("call.success", {
        model,
        attempt: 2,
        imageCount: imageUrls.length,
        promptLength: retryValidated.data.prompt.length,
        order: retryValidated.data.order,
        ...usage,
      });
      return {
        order: retryValidated.data.order,
        prompt: retryValidated.data.prompt,
        anthropicRequestId,
        ...usage,
        fallbackUsed: false,
      };
    }

    log("call.validationFailed", {
      model,
      attempt: 2,
      error: retryValidated.success
        ? `order is not a valid permutation of 0..${imageUrls.length - 1}`
        : retryValidated.error.message,
      rawPreview: retryText.slice(0, 300),
    });
  } catch (err) {
    log("call.failed", {
      model,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const prompt = fallbackPrompt(
    imageUrls.length,
    durationSec,
    input.mood,
    input.voiceoverText,
    input.musicPrompt,
  );
  log("call.fallbackUsed", {
    model,
    imageCount: imageUrls.length,
    promptLength: prompt.length,
  });
  return {
    // Fallback keeps the input order — we have no basis for reordering
    // without the LLM's visual reasoning.
    order: identityOrder(imageUrls.length),
    prompt,
    anthropicRequestId,
    ...usage,
    fallbackUsed: true,
  };
}

export const SEEDANCE_MULTIREF_MAX_IMAGES = MAX_IMAGES;
export const SEEDANCE_MULTIREF_MIN_DURATION = MIN_DURATION;
export const SEEDANCE_MULTIREF_MAX_DURATION = MAX_DURATION;
