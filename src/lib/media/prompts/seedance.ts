/**
 * Prompt translation for ByteDance Seedance on kie.ai.
 *
 * Seedance 2.0 natively supports `@imageN` placeholder tokens inside the
 * prompt, bound 1:1 by index to entries in the `reference_image_urls` array.
 * We preserve these tokens verbatim so the model can assign per-image roles.
 *
 * Strategy: normalize `@imageN` tokens (lowercase), strip any that point
 * past the actual uploaded-image count, collapse whitespace. If the prompt
 * reads as empty after mentions are discounted, return a sensible
 * real-estate default.
 *
 * Historical note: an earlier revision had a Tier-2 LLM call via the kie.ai
 * codex endpoint that rewrote "terse" camera-verb-dominated prompts into
 * richer prose. That was useful when callers were shipping 1-2 word motion
 * hints. The current callers (scene-based writer + seedance-multiref
 * writer) both emit fully-authored prompts via Claude Sonnet, so the
 * translator was stacking an extra 5-second LLM call on top of an already
 * thoughtful prompt. Removed to cut cost + latency.
 *
 * Keep this file pure — no Next.js or server-only imports — so it can be
 * called from Trigger.dev tasks via `kieai.ts`.
 */

const DEFAULT_SEEDANCE_PROMPT =
  "Slow cinematic camera movement across a real estate property, professional cinematography";

const MENTION_REGEX = /@image(\d+)/gi;

/** Logger signature matches `logKie` in kieai.ts so we get structured events. */
type Logger = (event: string, data: Record<string, unknown>) => void;

interface TranslateContext {
  /**
   * Total uploaded images available as references. `@imageN` tokens where
   * N is outside `[1, imageCount]` are stripped. Defaults to 0.
   */
  imageCount?: number;
}

interface TranslateOptions {
  log?: Logger;
}

/**
 * Tier 1: normalize `@imageN` mentions and collapse whitespace.
 *
 * Seedance binds `@image1` -> reference_image_urls[0], `@image2` -> [1], ...
 * so any mention whose index is out of range for the actually-uploaded
 * images is dangling and must be removed (otherwise Seedance treats the
 * token as literal prompt text and produces garbage).
 */
export function cleanMentionTokens(raw: string, imageCount = 0): string {
  const normalized = raw.replace(MENTION_REGEX, (_match, digits: string) => {
    const n = Number.parseInt(digits, 10);
    if (!Number.isFinite(n) || n < 1 || n > imageCount) return "";
    return `@image${n}`;
  });
  return normalized.replace(/\s+/g, " ").trim();
}

/** Count `@imageN` tokens in the cleaned prompt. */
function countMentions(cleaned: string): number {
  const matches = cleaned.match(MENTION_REGEX);
  return matches ? matches.length : 0;
}

/** Strip `@imageN` tokens for length-based heuristics only (not mutation). */
function lengthWithoutMentions(cleaned: string): number {
  return cleaned.replace(MENTION_REGEX, "").replace(/\s+/g, " ").trim().length;
}

/**
 * Public entry point. Normalizes mentions and falls back to a sensible
 * default if the prompt is effectively empty. Always resolves to a usable
 * prompt string — never throws.
 */
export async function translatePromptForSeedance(
  userPrompt: string | undefined | null,
  context: TranslateContext = {},
  options: TranslateOptions = {},
): Promise<string> {
  const originalLength = typeof userPrompt === "string" ? userPrompt.length : 0;
  const imageCount = context.imageCount ?? 0;
  const log = options.log;

  const cleaned = cleanMentionTokens(userPrompt ?? "", imageCount);
  const mentionCount = countMentions(cleaned);
  const proseLength = lengthWithoutMentions(cleaned);

  // Empty / too-short fallback — measured on prose-only length so a prompt
  // like "@image1 @image2" doesn't trip the default.
  if (!cleaned || proseLength < 25) {
    const fallback = proseLength >= 25 ? cleaned : DEFAULT_SEEDANCE_PROMPT;
    log?.("seedance.promptTranslated", {
      originalLength,
      translatedLength: fallback.length,
      mentionCount,
      reason: cleaned ? "tooShortAfterClean" : "empty",
    });
    return fallback;
  }

  log?.("seedance.promptTranslated", {
    originalLength,
    translatedLength: cleaned.length,
    mentionCount,
    reason: "passthrough",
  });
  return cleaned;
}
