/**
 * Centralised pricing table + cost helpers for engine runs.
 *
 * Every external API call (Anthropic, kie.ai, piapi.ai, ElevenLabs, Google
 * Cloud Vision) uses one of these helpers to compute `costUsd` and records it
 * in the matching `engine_steps.metrics` or `engine_scene_attempts.metrics`
 * JSON. On run finalize, the orchestrator sums the per-step costs into
 * `engine_runs.summary.cost.totalUsd` with a provider breakdown.
 *
 * All numbers below are USD. They are approximate/illustrative and should be
 * verified against each provider's current public pricing page before
 * billing on them. Override via env when upstream rates change:
 *   PRICE_CLAUDE_SONNET_IN_PER_M   (default 3.00)
 *   PRICE_CLAUDE_SONNET_OUT_PER_M  (default 15.00)
 *   PRICE_KLING_25_TURBO_PER_CLIP  (default 0.35)
 *   PRICE_SEEDANCE_2_PER_CLIP      (default 0.45)
 *   PRICE_SEEDANCE_2_FAST_PER_CLIP (default 0.25)
 *   PRICE_ELEVENLABS_TTS_PER_K     (default 0.15)
 *   PRICE_ELEVENLABS_MUSIC_PER_K   (default 0.30)
 *   PRICE_GCV_PER_IMAGE            (default 0.003)
 */

function envNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** USD per 1M tokens unless noted. Cache-read is typically 10% of input;
 *  cache-write is 125%. See Anthropic prompt-caching docs. */
const ANTHROPIC_RATES: Record<
  string,
  {
    inputPerM: number;
    outputPerM: number;
    cacheReadPerM: number;
    cacheWritePerM: number;
  }
> = {
  "claude-sonnet-4-6": {
    inputPerM: envNum("PRICE_CLAUDE_SONNET_IN_PER_M", 3.0),
    outputPerM: envNum("PRICE_CLAUDE_SONNET_OUT_PER_M", 15.0),
    cacheReadPerM: envNum("PRICE_CLAUDE_SONNET_CACHE_READ_PER_M", 0.3),
    cacheWritePerM: envNum("PRICE_CLAUDE_SONNET_CACHE_WRITE_PER_M", 3.75),
  },
  // Fallback — used when we encounter an unknown Claude model id. Mirrors
  // Sonnet pricing as a safe default.
  default: {
    inputPerM: 3.0,
    outputPerM: 15.0,
    cacheReadPerM: 0.3,
    cacheWritePerM: 3.75,
  },
};

function ratesFor(model: string | undefined): (typeof ANTHROPIC_RATES)[string] {
  if (model && ANTHROPIC_RATES[model]) return ANTHROPIC_RATES[model];
  return ANTHROPIC_RATES.default;
}

export interface AnthropicUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  model?: string;
}

/** Compute total USD cost for a single Anthropic call. */
export function anthropicCost(usage: AnthropicUsage): number {
  const r = ratesFor(usage.model);
  const input =
    ((usage.inputTokens ?? 0) / 1_000_000) * r.inputPerM;
  const output =
    ((usage.outputTokens ?? 0) / 1_000_000) * r.outputPerM;
  const cacheRead =
    ((usage.cacheReadTokens ?? 0) / 1_000_000) * r.cacheReadPerM;
  const cacheWrite =
    ((usage.cacheWriteTokens ?? 0) / 1_000_000) * r.cacheWritePerM;
  return round6(input + output + cacheRead + cacheWrite);
}

/** Cost for one kie.ai video generation clip, keyed by the kie.ai slug. */
export function kieaiClipCost(modelSlug: string): number {
  if (modelSlug.startsWith("kling/v2-5-turbo")) {
    return envNum("PRICE_KLING_25_TURBO_PER_CLIP", 0.35);
  }
  if (modelSlug === "bytedance/seedance-2-fast") {
    return envNum("PRICE_SEEDANCE_2_FAST_PER_CLIP", 0.25);
  }
  if (modelSlug.startsWith("bytedance/seedance-2")) {
    return envNum("PRICE_SEEDANCE_2_PER_CLIP", 0.45);
  }
  // Unknown model: record 0 rather than guess. Still flows through metrics
  // so the gap is visible in the inspector.
  return 0;
}

/**
 * Clip cost for a logical video model + provider. The scene generator works
 * in logical ids ("kling" / "seedance" / "seedance-fast"); this helper hides
 * the provider-specific slug mapping.
 */
export function sceneClipCost(
  providerName: "kieai" | "piapi" | "test-override",
  logicalModel: "kling" | "seedance" | "seedance-fast",
): number {
  if (providerName === "test-override") return 0;
  if (providerName === "kieai") {
    const slug =
      logicalModel === "kling"
        ? "kling/v2-5-turbo-image-to-video-pro"
        : logicalModel === "seedance"
          ? "bytedance/seedance-2"
          : "bytedance/seedance-2-fast";
    return kieaiClipCost(slug);
  }
  // piapi
  const taskType =
    logicalModel === "kling"
      ? "video_generation"
      : logicalModel === "seedance"
        ? "seedance-2"
        : "seedance-2-fast";
  return piapiClipCost(taskType);
}

/** Cost for one piapi video generation clip, keyed by piapi `task_type`. */
export function piapiClipCost(taskType: string): number {
  if (taskType === "seedance-2-fast") {
    return envNum("PRICE_SEEDANCE_2_FAST_PER_CLIP", 0.25);
  }
  if (taskType === "seedance-2") {
    return envNum("PRICE_SEEDANCE_2_PER_CLIP", 0.45);
  }
  if (taskType === "video_generation") {
    // piapi's Kling path uses task_type="video_generation" with input.version
    // deciding Kling revision. Price per clip roughly matches kie.ai Kling.
    return envNum("PRICE_KLING_25_TURBO_PER_CLIP", 0.35);
  }
  return 0;
}

export interface ElevenLabsUsage {
  kind: "tts" | "music";
  charCount: number;
}

/** ElevenLabs billing is per character for TTS and per character of the
 *  prompt (approx) for music. For rough parity we use characters for both. */
export function elevenlabsCost(usage: ElevenLabsUsage): number {
  const perK =
    usage.kind === "tts"
      ? envNum("PRICE_ELEVENLABS_TTS_PER_K", 0.15)
      : envNum("PRICE_ELEVENLABS_MUSIC_PER_K", 0.3);
  return round6((usage.charCount / 1000) * perK);
}

/** Google Cloud Vision is priced per-feature per-image. We call LABEL + OBJECT
 *  detection per image; bundled rate ≈ $3 per 1k images (≈ $0.003 each). */
export function gcvCost(imageCount = 1): number {
  return round6(imageCount * envNum("PRICE_GCV_PER_IMAGE", 0.003));
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Shape written to `engine_steps.metrics` / `engine_scene_attempts.metrics`.
 * Keep this JSON-friendly — no classes, no Date objects. The `notes` field
 * carries anything the rollup doesn't understand (e.g. model-specific hints)
 * without blocking future evolution.
 */
export interface CostEntry {
  provider: "anthropic" | "kieai" | "piapi" | "elevenlabs" | "gcv";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  clipCount?: number;
  charCount?: number;
  imageCount?: number;
  costUsd: number;
  notes?: Record<string, unknown>;
}
