/**
 * Prompt parsing for Kling 2.6 multi-shot-via-concatenation.
 *
 * Kling 2.6's i2v endpoint is single-shot (one image → one 5s or 10s clip).
 * For multi-shot videos, we fan out N single-shot generations at the
 * Trigger.dev layer and concatenate the outputs with ffmpeg. This module
 * turns the user's prompt + image list into that plan.
 *
 * Default behavior (what most users get): when ≥2 images are attached, one
 * shot is produced per image, all shots share the user's prompt, each shot
 * uses the user's selected duration (5s or 10s). Total video length = N ×
 * per-shot duration. No `---` or `@imageN` required.
 *
 * Power-user grammar (silent — not surfaced in the UI):
 *   - A line containing only `---` splits the prompt into per-shot segments.
 *     Each segment becomes its own shot and the auto-fan-by-image rule is
 *     bypassed (trust the user's explicit layout).
 *   - An optional `(Ns)` / `(N sec)` suffix pins a shot's duration (rounded
 *     to Kling's valid set {5, 10}).
 *   - `@imageN` inside a `---`-split shot overrides which uploaded image is
 *     that shot's first-frame. Ignored in auto-fan mode.
 *
 * Pure module — no Next.js or Trigger.dev imports — safe from both routes
 * and tasks.
 */

const DEFAULT_SHOT_PROMPT =
  "Slow cinematic camera movement across a real estate property, professional cinematography";

/** Kling 2.6 i2v constraints */
export const KLING_MAX_SHOTS = 8;
const KLING_MAX_SHOT_PROMPT_CHARS = 500;
/** Valid Kling 2.6 per-shot durations (seconds). */
export const KLING_SHOT_DURATIONS = [5, 10] as const;
export type KlingShotDuration = (typeof KLING_SHOT_DURATIONS)[number];

const SHOT_SEPARATOR_REGEX = /^\s*---+\s*$/m;
const SHOT_DURATION_SUFFIX_REGEX = /\(\s*(\d+)\s*s(?:ec(?:onds?)?)?\s*\)\s*$/i;
const MENTION_REGEX = /@image(\d+)/gi;

export interface ParsedKlingShot {
  prompt: string;
  duration: KlingShotDuration;
  /** 1-based index into the uploaded image list, or null for text-to-video. */
  imageNumber: number | null;
}

export interface ParseKlingShotsResult {
  shots: ParsedKlingShot[];
  /** Sum of `shots[i].duration`. */
  totalDuration: number;
  /** Raw number of `---`-separated segments the user authored (pre-cap).
   * 0 when auto-fan-by-image is used. */
  rawShotCount: number;
  /** Count of `@imageN` tokens (any N) observed across the input. */
  mentionCount: number;
  /** How the shot list was produced — useful for logging. */
  mode: "auto-fan" | "explicit-segments" | "single";
}

/** Round an arbitrary seconds value to Kling's nearest valid shot duration. */
function roundToKlingDuration(seconds: number): KlingShotDuration {
  if (!Number.isFinite(seconds)) return 5;
  return seconds >= 7.5 ? 10 : 5;
}

/**
 * Distribute a target total duration across N auto-fan shots, given that each
 * shot must be 5s or 10s. Achievable totals for N shots form the 5s-step range
 * [5N, 10N]; values outside are clamped, and fractional values snap to the
 * nearest multiple of 5. Long shots are placed first — they tend to read as
 * "openers" and give the concatenated video a wide-then-tight rhythm. Power
 * users who want different ordering can switch to the `---` explicit-segments
 * grammar and pin each shot's duration with `(Ns)`.
 */
export function distributeKlingShots(
  totalDuration: number,
  imageCount: number,
): KlingShotDuration[] {
  const N = Math.min(Math.max(imageCount, 0), KLING_MAX_SHOTS);
  if (N === 0) return [];

  const min = 5 * N;
  const max = 10 * N;
  const clamped = Math.max(min, Math.min(max, totalDuration));
  const snapped = Math.round(clamped / 5) * 5;
  const tensCount = (snapped - min) / 5;

  const shots: KlingShotDuration[] = [];
  for (let i = 0; i < tensCount; i++) shots.push(10);
  for (let i = 0; i < N - tensCount; i++) shots.push(5);
  return shots;
}

/** Minimum / maximum totals achievable by auto-fan for a given image count. */
export function klingTotalBounds(imageCount: number): { min: number; max: number } {
  const N = Math.min(Math.max(imageCount, 1), KLING_MAX_SHOTS);
  return { min: 5 * N, max: 10 * N };
}

/** Strip `@imageN` tokens and normalize whitespace. */
function cleanPromptText(raw: string): string {
  return raw.replace(MENTION_REGEX, "").replace(/\s+/g, " ").trim();
}

/**
 * Parse a user prompt into per-shot Kling 2.6 i2v jobs.
 *
 * @param rawPrompt        Raw textarea contents.
 * @param totalDuration    Target TOTAL video duration in seconds. Auto-fan
 *                         distributes this across N shots using 5s/10s
 *                         per-shot durations (snapped to the nearest 5s
 *                         multiple in [5N, 10N]). For single-shot mode the
 *                         total IS the per-shot duration. Explicit-segments
 *                         mode ignores the total for shots that pin their own
 *                         `(Ns)` suffix, and uses `round(total / segments)`
 *                         as the fallback for unpinned segments.
 * @param imageCount       Number of uploaded images. 0 ⇒ all shots are t2v.
 */
export function parseKlingShots(
  rawPrompt: string | undefined | null,
  totalDuration: number,
  imageCount: number,
): ParseKlingShotsResult {
  const prompt = (rawPrompt ?? "").trim();
  const mentionCount = (prompt.match(MENTION_REGEX) || []).length;
  const hasSeparator = SHOT_SEPARATOR_REGEX.test(prompt);

  // --- Auto-fan mode (the default): no separators, ≥2 images → one shot per
  // image, each using the user's prompt verbatim. Per-shot durations come from
  // `distributeKlingShots`, which mixes 5s and 10s to hit the requested total.
  if (!hasSeparator && imageCount >= 2) {
    const cleaned = cleanPromptText(prompt);
    const basePrompt = (cleaned || DEFAULT_SHOT_PROMPT).slice(
      0,
      KLING_MAX_SHOT_PROMPT_CHARS,
    );
    const durations = distributeKlingShots(totalDuration, imageCount);
    const shots: ParsedKlingShot[] = durations.map((d, i) => ({
      prompt: basePrompt,
      duration: d,
      imageNumber: i + 1,
    }));
    return {
      shots,
      totalDuration: shots.reduce((s, sh) => s + sh.duration, 0),
      rawShotCount: 0,
      mentionCount,
      mode: "auto-fan",
    };
  }

  // --- Single-shot fallback (no separators, 0 or 1 images). The total IS the
  // per-shot duration; snap to Kling's valid set.
  if (!hasSeparator) {
    const cleaned = cleanPromptText(prompt);
    const basePrompt = (cleaned || DEFAULT_SHOT_PROMPT).slice(
      0,
      KLING_MAX_SHOT_PROMPT_CHARS,
    );
    const singleDuration = roundToKlingDuration(totalDuration);
    const shots: ParsedKlingShot[] = [
      {
        prompt: basePrompt,
        duration: singleDuration,
        imageNumber: imageCount > 0 ? 1 : null,
      },
    ];
    return {
      shots,
      totalDuration: singleDuration,
      rawShotCount: 0,
      mentionCount,
      mode: "single",
    };
  }

  // --- Explicit `---` mode: user has authored per-shot segments. Trust the
  // layout. Each segment = one shot; `(Ns)` pins its duration; `@imageN`
  // picks its first-frame.
  const rawSegments = prompt
    .split(SHOT_SEPARATOR_REGEX)
    .map((s) => s.trim())
    .filter(Boolean);
  const rawShotCount = rawSegments.length || 1;
  const segments = rawSegments.length > 0 ? rawSegments : [""];

  // Cap shot count; fold overflow into the last kept shot so nothing is lost.
  const capped: string[] = segments.slice(0, KLING_MAX_SHOTS);
  if (segments.length > KLING_MAX_SHOTS) {
    const overflow = segments.slice(KLING_MAX_SHOTS).join(" ");
    capped[KLING_MAX_SHOTS - 1] = `${capped[KLING_MAX_SHOTS - 1]} ${overflow}`.trim();
  }

  // Fallback for segments that don't pin their own `(Ns)`: divide the target
  // total evenly across the kept shot count and snap to Kling's valid set.
  const fallbackDuration = roundToKlingDuration(totalDuration / capped.length);

  const shots: ParsedKlingShot[] = capped.map((seg) => {
    const durationMatch = seg.match(SHOT_DURATION_SUFFIX_REGEX);
    const explicit = durationMatch
      ? roundToKlingDuration(Number.parseInt(durationMatch[1], 10))
      : undefined;
    const withoutDuration = durationMatch
      ? seg.slice(0, durationMatch.index).trim()
      : seg;

    // First in-range @imageN mention wins for first-frame selection.
    let imageNumber: number | null = null;
    for (const match of withoutDuration.matchAll(MENTION_REGEX)) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= imageCount) {
        imageNumber = n;
        break;
      }
    }
    if (imageNumber === null && imageCount > 0) imageNumber = 1;

    const finalPrompt = (
      cleanPromptText(withoutDuration) || DEFAULT_SHOT_PROMPT
    ).slice(0, KLING_MAX_SHOT_PROMPT_CHARS);

    return {
      prompt: finalPrompt,
      duration: explicit ?? fallbackDuration,
      imageNumber,
    };
  });

  return {
    shots,
    totalDuration: shots.reduce((s, sh) => s + sh.duration, 0),
    rawShotCount,
    mentionCount,
    mode: "explicit-segments",
  };
}

/** Effect spec consumed by `applyEffectToShots`. Matches the wire-protocol
 * `effectPhrases` payload so the trigger task can pass it straight through. */
export interface KlingEffectSpec {
  opener: string;
  transition?: string;
  closer?: string;
}

/**
 * Prepend effect phrases to a parsed Kling shot list:
 *   - Shot 1              → `<opener>. <prompt>`
 *   - Shots 2..N-1        → `<transition>. <prompt>` (only if `transition` set)
 *   - Shot N              → `<closer>. <prompt>`    (only if `closer` set)
 *
 * Edge cases:
 *   - N=1: only the opener applies; closer is ignored (one shot can't be both).
 *   - N=2: opener on shot 1, closer on shot 2, no middle → transition ignored.
 *   - N≥3: opener + transitions on all middles + closer.
 *
 * Pure function — returns a new array, leaves the input untouched. Each
 * resulting prompt is truncated to Kling's 500-char limit so wrapping can't
 * overflow the per-shot cap even when `shot.prompt` was already near the edge.
 */
export function applyEffectToShots(
  shots: ParsedKlingShot[],
  effect?: KlingEffectSpec | null,
): ParsedKlingShot[] {
  if (!effect) return shots;
  const n = shots.length;
  if (n === 0) return shots;

  const wrap = (phrase: string | undefined, prompt: string) => {
    if (!phrase) return prompt;
    const trimmed = phrase.trim();
    if (!trimmed) return prompt;
    // If the phrase already ends in a sentence terminator, don't double it up.
    const sep = /[.!?]$/.test(trimmed) ? " " : ". ";
    return `${trimmed}${sep}${prompt}`.slice(0, KLING_MAX_SHOT_PROMPT_CHARS);
  };

  return shots.map((shot, i) => {
    let phrase: string | undefined;
    if (i === 0) {
      phrase = effect.opener;
    } else if (i === n - 1 && effect.closer) {
      phrase = effect.closer;
    } else if (i > 0 && i < n - 1 && effect.transition) {
      phrase = effect.transition;
    }
    return phrase ? { ...shot, prompt: wrap(phrase, shot.prompt) } : shot;
  });
}
