/**
 * Prompt translation for ByteDance Seedance on kie.ai.
 *
 * Seedance 2.0 natively supports `@imageN` placeholder tokens inside the
 * prompt, bound 1:1 by index to entries in the `reference_image_urls` array
 * (e.g. `@image1 as the hero product, @image2 for lighting mood`). We
 * preserve these tokens verbatim so the model can assign per-image roles.
 *
 * Two-tier strategy:
 *   1. Always normalize `@imageN` tokens (lowercase), strip any that point
 *      past the actual uploaded-image count, and collapse whitespace.
 *      If the prompt reads as empty after mentions are discounted, return a
 *      sensible real-estate default.
 *   2. If the prompt is still terse/direction-only, call the shared LLM
 *      client (`src/lib/llm/codex.ts`) to rewrite it as a 1-2 sentence
 *      Seedance-ready scene description — while preserving `@imageN`
 *      tokens exactly.
 *
 * If the LLM call errors, times out, or drops mentions that were in the
 * input, we silently fall back to the Tier-1 cleaned prompt.
 *
 * Keep this file pure — no Next.js or server-only imports — so it can be
 * called from Trigger.dev tasks via `kieai.ts`.
 */

import { callCodex } from "@/lib/llm/codex";

const DEFAULT_SEEDANCE_PROMPT =
  "Slow cinematic camera movement across a real estate property, professional cinematography";

const LLM_TIMEOUT_MS = 5000;

/** Cinematography verbs that by themselves don't describe a scene. */
const CAMERA_VERBS = [
  "pan",
  "dolly",
  "zoom",
  "tilt",
  "truck",
  "crane",
  "orbit",
  "push",
  "pull",
  "track",
  "slide",
  "glide",
];

const MENTION_REGEX = /@image(\d+)/gi;

/** Logger signature matches `logKie` in kieai.ts so we get structured events. */
type Logger = (event: string, data: Record<string, unknown>) => void;

interface TranslateContext {
  duration?: number;
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

/** Heuristic: does the cleaned prompt look too terse / direction-only? */
export function isTerse(cleaned: string): boolean {
  const stripped = cleaned.replace(MENTION_REGEX, "").replace(/\s+/g, " ").trim();
  if (!stripped) return true;
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length < 12) return true;

  // If the prompt is dominated by camera verbs with no scene nouns,
  // treat it as direction-only. Cheap check: does every non-stopword
  // token look like a camera verb or a trivial connector?
  const lowered = stripped.toLowerCase();
  const hasCameraVerb = CAMERA_VERBS.some((v) =>
    new RegExp(`\\b${v}s?(?:ing)?\\b`).test(lowered),
  );
  // "Scene nouns" heuristic — any content word of 4+ chars that isn't a
  // camera verb. If none, it's likely pure direction.
  const sceneNouns = words.filter((w) => {
    const l = w.toLowerCase().replace(/[^a-z]/g, "");
    if (l.length < 4) return false;
    return !CAMERA_VERBS.some((v) => l.startsWith(v));
  });
  if (hasCameraVerb && sceneNouns.length < 3) return true;

  return false;
}

/**
 * Ask the kie.ai codex endpoint (same one used by /api/generate-script) to
 * rewrite a terse prompt into a Seedance-ready scene description.
 * Returns `null` on any failure or timeout so callers can fall back.
 */
async function enrichWithLLM(
  cleaned: string,
  ctx: TranslateContext,
): Promise<string | null> {
  // Missing API key / any other error inside callCodex throws and we
  // fall through to the `null` branch below, preserving the pre-refactor
  // silent-fallback behavior.
  const duration = ctx.duration ?? 5;
  const system =
    `You rewrite short real-estate video prompts into rich scene descriptions for the ByteDance Seedance text-to-video model. ` +
    `Seedance wants prose that describes subjects, setting, motion, lighting, and atmosphere — not cinematography shorthand alone. ` +
    `Given a terse user prompt, produce ONE or TWO sentences (max ~60 words) describing the scene for a ${duration}-second clip. ` +
    `Preserve the user's intended motion and mood. Add plausible real-estate setting details (interior/exterior cues, natural light, warm atmosphere) only if the user didn't specify. ` +
    `CRITICAL: preserve any @imageN tokens (e.g. @image1, @image2) exactly as written — they are reference anchors the model relies on; do not rename, renumber, reformat, or remove them. ` +
    `Output only the rewritten prompt — no quotes, no preamble, no explanation.`;

  try {
    const result = await callCodex({
      system,
      prompt: `User prompt: ${cleaned}`,
      timeoutMs: LLM_TIMEOUT_MS,
    });
    return result.text || null;
  } catch {
    // Silent fallback — any failure (timeout, HTTP, missing key, no text)
    // is treated as "no enrichment available" per the caller contract.
    return null;
  }
}

/**
 * Public entry point. See file header for behavior. Always resolves to a
 * usable prompt string — never throws.
 */
export async function translatePromptForSeedance(
  userPrompt: string | undefined | null,
  context: TranslateContext = {},
  options: TranslateOptions = {},
): Promise<string> {
  const originalLength = typeof userPrompt === "string" ? userPrompt.length : 0;
  const imageCount = context.imageCount ?? 0;
  const log = options.log;

  // Tier 1: normalize mentions + whitespace.
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
      usedLLM: false,
      mentionCount,
      reason: cleaned ? "tooShortAfterClean" : "empty",
    });
    return fallback;
  }

  // Tier 2: LLM enrichment for terse/direction-only prompts
  if (isTerse(cleaned)) {
    const enriched = await enrichWithLLM(cleaned, context);
    if (enriched) {
      const enrichedMentionCount = countMentions(enriched);
      // If the input had mentions but the LLM dropped them, we lose the
      // reference anchoring — fall back to the cleaned prompt instead.
      if (mentionCount > 0 && enrichedMentionCount === 0) {
        log?.("seedance.promptTranslated", {
          originalLength,
          translatedLength: cleaned.length,
          usedLLM: false,
          mentionCount,
          reason: "llmDroppedMentions",
        });
        return cleaned;
      }
      log?.("seedance.promptTranslated", {
        originalLength,
        translatedLength: enriched.length,
        usedLLM: true,
        mentionCount: enrichedMentionCount,
        reason: "terse",
      });
      return enriched;
    }
    // LLM failed — fall through to cleaned prompt.
    log?.("seedance.promptTranslated", {
      originalLength,
      translatedLength: cleaned.length,
      usedLLM: false,
      mentionCount,
      reason: "llmFailed",
    });
    return cleaned;
  }

  // Rich enough — pass through with just the mention normalization.
  log?.("seedance.promptTranslated", {
    originalLength,
    translatedLength: cleaned.length,
    usedLLM: false,
    mentionCount,
    reason: "richPassthrough",
  });
  return cleaned;
}
