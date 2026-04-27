import type {
  IMediaProvider, MediaJobResult,
  ImageEnhancementOptions, VirtualStagingOptions,
  SkyReplacementOptions, VideoGenerationOptions,
  VideoModel,
} from "../types";
import { translatePromptForSeedance } from "../prompts/seedance";

const BASE_URL = "https://api.kie.ai";

/**
 * Structured logger for kie.ai calls. Emits single-line JSON so Trigger.dev's
 * console capture shows it as a searchable event. Shape:
 *   { source: "kieai", event: "createTask.response", taskId, durationMs, ... }
 */
function logKie(event: string, data: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ source: "kieai", event, ...data }));
  } catch {
    // Never let logging break the request path.
    console.log(`[kieai] ${event}`);
  }
}
function logKieError(event: string, data: Record<string, unknown>): void {
  try {
    console.error(
      JSON.stringify({ source: "kieai", event, level: "error", ...data }),
    );
  } catch {
    console.error(`[kieai] ${event} (error)`);
  }
}

/**
 * Provider-internal: maps the app's logical `VideoModel` ids to kie.ai slugs.
 * Kept private so swapping in another provider (e.g. piapi.ai) with a
 * different slug system is a contained change. Callers pass the logical id
 * via `VideoGenerationOptions.model` and never see these strings.
 */
/**
 * kie.ai Market endpoint model slugs (see https://docs.kie.ai/market).
 * The "kling" logical id maps to Kling 2.6 i2v. Kling 3.0 has a docs page
 * (https://docs.kie.ai/market/kling/kling-3-0) but the 3.0 i2v slug is not
 * yet accepted by the API — kie.ai 422s `kling-3.0` and
 * `kling-3.0/image-to-video`. Only motion-control-v3 is live so far. Flip
 * this to `kling-3.0/image-to-video` once kie.ai enables it. The 2.x i2v
 * schema (image_urls array, mode, aspect_ratio) matches 3.0's, so the
 * branch in `generateVideo` won't need to change.
 */
const VIDEO_MODEL_SLUGS: Record<VideoModel, string> = {
  kling: "kling-2.6/image-to-video",
  seedance: "bytedance/seedance-2",
  "seedance-fast": "bytedance/seedance-2-fast",
};

/**
 * Kling 2.5 Turbo anti-artifact defaults.
 *
 * Our motion prompts are intentionally terse (see prompt-writer's Kling system
 * prompt), so Kling has room to invent bizarre camera moves and hallucinate
 * objects when left unconstrained. Two upstream knobs suppress this:
 *
 *   • `negative_prompt` enumerates failure modes we actually see in real-estate
 *     output (warped walls, morphing furniture, duplicates, flicker, spurious
 *     text/logos). kie.ai caps this at 500 chars; we stay under 400 to leave
 *     headroom for retry augmentation (see `scene-generator` — the evaluator's
 *     `issues[]` get appended on attempt 2).
 *   • `cfg_scale` raises prompt adherence above Kling's 0.5 default. 0.6 is a
 *     conservative lift that tightens motion fidelity without making output
 *     rigid; the scene-generator bumps to 0.75 on retry.
 *
 * Both are overridable from `VideoGenerationOptions` and from env vars so we
 * can canary changes in prod without a code push.
 */
export const DEFAULT_KLING_NEGATIVE_PROMPT =
  "warped walls, morphing furniture, melted objects, duplicated people, floating items, twisted windows, flicker, jitter, text artifacts, watermarks, logos, hands, people, cartoon, anime, blurry, low quality, distorted geometry, extra limbs, deformed architecture, liquid walls";
export const DEFAULT_KLING_CFG_SCALE = 0.6;
/**
 * cfg_scale used on the retry attempt when a scene fails evaluation or the
 * provider errors. Tighter prompt adherence than the baseline — trades a hair
 * of creative liberty for fewer invented camera moves. Overridable via
 * ENGINE_KLING_RETRY_CFG_SCALE.
 */
export const DEFAULT_KLING_RETRY_CFG_SCALE = 0.75;

/** Append evaluator-reported issues to the baseline negative prompt, cap at 500 chars. */
export function composeKlingRetryNegativePrompt(issues: string[]): string {
  const base = DEFAULT_KLING_NEGATIVE_PROMPT;
  const extra = issues.map((s) => s.trim()).filter(Boolean).join(", ");
  if (!extra) return base;
  const combined = `${base}, ${extra}`;
  if (combined.length <= 500) return combined;
  const trimmed = combined.slice(0, 500);
  const lastComma = trimmed.lastIndexOf(",");
  return lastComma > 400 ? trimmed.slice(0, lastComma) : trimmed;
}

/** Shared headers for all kie.ai requests */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.KIEAI_CODEX_KEY}`,
    ...extra,
  };
}

/**
 * Extract a short, non-sensitive summary of the inputs we sent so error logs
 * can point at the offending image URL without dumping the entire prompt.
 */
function summarizeKieInput(input: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  const imageFields: Array<keyof typeof input> = [
    "image_url",
    "image_urls",
    "image_input",
    "first_frame_url",
    "reference_image_urls",
    "inputImage",
  ];
  for (const k of imageFields) {
    if (input[k] !== undefined) summary[k] = input[k];
  }
  if (typeof input.prompt === "string") {
    summary.promptPreview = (input.prompt as string).slice(0, 120);
    summary.promptLength = (input.prompt as string).length;
  }
  if (input.duration !== undefined) summary.duration = input.duration;
  return summary;
}

/**
 * kie.ai returns HTTP 429 when the per-account rate limit is exceeded
 * (default: 20 new generation requests per 10 seconds). Rejected requests
 * do not enter the queue — retrying after a short backoff is the expected
 * behaviour. Tunables:
 *   KIEAI_CREATE_TASK_MAX_ATTEMPTS    default 5
 *   KIEAI_CREATE_TASK_BACKOFF_MS      base delay, default 1000 (1s)
 *   KIEAI_CREATE_TASK_MAX_BACKOFF_MS  ceiling, default 15000 (15s)
 * Worst-case wait with defaults: 1 + 2 + 4 + 8 = 15s before the 5th attempt.
 */
function isKieRateLimit(info: {
  status: number;
  code?: number;
  msg?: string;
}): boolean {
  if (info.status === 429) return true;
  if (info.code === 429) return true;
  if (info.msg && /rate limit|too many requests|requests per/i.test(info.msg)) {
    return true;
  }
  return false;
}

const kieSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** POST to the unified Market createTask endpoint.
 *  Retries on 429 with exponential backoff. */
async function createTask(body: { model: string; callBackUrl?: string; input: Record<string, unknown> }) {
  const maxAttempts = Number(process.env.KIEAI_CREATE_TASK_MAX_ATTEMPTS ?? 5);
  const baseBackoffMs = Number(process.env.KIEAI_CREATE_TASK_BACKOFF_MS ?? 1000);
  const maxBackoffMs = Number(process.env.KIEAI_CREATE_TASK_MAX_BACKOFF_MS ?? 15000);

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = Date.now();
    logKie("createTask.request", { model: body.model, attempt });
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/api/v1/jobs/createTask`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      logKieError("createTask.networkError", {
        model: body.model,
        attempt,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        inputSummary: summarizeKieInput(body.input),
      });
      throw err;
    }

    if (res.ok) {
      const json = await res.json();
      if (json.code !== 200) {
        const inputSummary = summarizeKieInput(body.input);
        const rateLimited = isKieRateLimit({
          status: res.status,
          code: json.code,
          msg: json.msg,
        });
        if (rateLimited && attempt < maxAttempts) {
          const backoff = Math.min(
            baseBackoffMs * 2 ** (attempt - 1),
            maxBackoffMs,
          );
          logKie("createTask.retryScheduled", {
            model: body.model,
            attempt,
            nextDelayMs: backoff,
            reason: "rate_limit",
            code: json.code,
            msg: json.msg,
          });
          await kieSleep(backoff);
          lastErr = new Error(
            `kie.ai createTask error ${json.code}: ${json.msg}`,
          );
          continue;
        }
        logKieError("createTask.apiError", {
          model: body.model,
          attempt,
          code: json.code,
          msg: json.msg,
          durationMs: Date.now() - start,
          inputSummary,
        });
        throw new Error(
          `kie.ai createTask error ${json.code}: ${json.msg} [model=${body.model}, input=${JSON.stringify(inputSummary)}]`,
        );
      }
      const taskId = json.data.taskId as string;
      logKie("createTask.response", {
        taskId,
        model: body.model,
        attempt,
        durationMs: Date.now() - start,
      });
      return taskId;
    }

    // HTTP error path.
    const text = await res.text();
    const inputSummary = summarizeKieInput(body.input);
    let parsedMsg: string | undefined;
    try {
      parsedMsg = JSON.parse(text)?.msg;
    } catch {
      /* body was not JSON */
    }
    const rateLimited = isKieRateLimit({
      status: res.status,
      msg: parsedMsg ?? text,
    });

    if (rateLimited && attempt < maxAttempts) {
      const backoff = Math.min(
        baseBackoffMs * 2 ** (attempt - 1),
        maxBackoffMs,
      );
      logKie("createTask.retryScheduled", {
        model: body.model,
        attempt,
        nextDelayMs: backoff,
        reason: "http_rate_limit",
        status: res.status,
      });
      await kieSleep(backoff);
      lastErr = new Error(
        `kie.ai createTask ${res.status}: ${text.slice(0, 200)}`,
      );
      continue;
    }

    logKieError("createTask.httpError", {
      model: body.model,
      attempt,
      status: res.status,
      body: text,
      durationMs: Date.now() - start,
      inputSummary,
    });
    // Attach input summary to the thrown error so the trigger task log and
    // `assets.metadata.lastError` include the offending image URL. kie.ai's
    // "File type not supported" response has no input context otherwise.
    throw new Error(
      `kie.ai createTask ${res.status}: ${text} [model=${body.model}, input=${JSON.stringify(inputSummary)}]`,
    );
  }

  logKieError("createTask.retryExhausted", {
    model: body.model,
    maxAttempts,
    lastError: lastErr?.message,
  });
  throw lastErr ??
    new Error(`kie.ai createTask: retries exhausted (${maxAttempts})`);
}

/** POST to the Flux Kontext generation endpoint (separate from unified createTask) */
async function createFluxKontextTask(body: Record<string, unknown>) {
  const start = Date.now();
  const model = typeof body.model === "string" ? body.model : "flux-kontext";
  logKie("fluxKontext.create.request", { model });
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/v1/flux/kontext/generate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
  } catch (err) {
    logKieError("fluxKontext.create.networkError", {
      model,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  if (!res.ok) {
    const text = await res.text();
    logKieError("fluxKontext.create.httpError", {
      model,
      status: res.status,
      body: text,
      durationMs: Date.now() - start,
    });
    throw new Error(`kie.ai flux-kontext ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.code !== 200) {
    logKieError("fluxKontext.create.apiError", {
      model,
      code: json.code,
      msg: json.msg,
      durationMs: Date.now() - start,
    });
    throw new Error(`kie.ai flux-kontext error ${json.code}: ${json.msg}`);
  }
  const taskId = json.data.taskId as string;
  logKie("fluxKontext.create.response", {
    taskId,
    model,
    durationMs: Date.now() - start,
  });
  return taskId;
}

/**
 * Poll the unified Market task status endpoint until success or failure.
 * Task states: waiting -> queuing -> generating -> success | fail
 */
async function pollMarketTask(taskId: string, maxWaitMs = 1_500_000): Promise<string[]> {
  const start = Date.now();
  const interval = 3000;
  const deadline = start + maxWaitMs;
  let attempts = 0;
  logKie("pollMarketTask.start", { taskId, maxWaitMs });
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    attempts++;
    const res = await fetch(`${BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { "Authorization": `Bearer ${process.env.KIEAI_CODEX_KEY}` },
    });
    if (!res.ok) {
      const text = await res.text();
      logKieError("pollMarketTask.httpError", {
        taskId,
        status: res.status,
        body: text,
        attempts,
        durationMs: Date.now() - start,
      });
      throw new Error(`kie.ai poll ${res.status}: ${text}`);
    }
    const json = await res.json();
    const state = json.data?.state;

    if (state === "success") {
      const resultJson = JSON.parse(json.data.resultJson ?? "{}");
      const urls: string[] = resultJson.resultUrls ?? [];
      logKie("pollMarketTask.success", {
        taskId,
        attempts,
        durationMs: Date.now() - start,
        resultCount: urls.length,
      });
      return urls;
    }
    if (state === "fail") {
      const failMsg = json.data.failMsg || json.data.failCode || "unknown";
      logKieError("pollMarketTask.fail", {
        taskId,
        attempts,
        durationMs: Date.now() - start,
        failMsg: json.data.failMsg,
        failCode: json.data.failCode,
      });
      throw new Error(`kie.ai task failed: ${failMsg}`);
    }
    // waiting, queuing, generating -> keep polling
  }
  logKieError("pollMarketTask.timeout", {
    taskId,
    attempts,
    durationMs: Date.now() - start,
    maxWaitMs,
  });
  throw new Error("kie.ai task timed out");
}

/** Poll the Flux Kontext task status endpoint */
async function pollFluxKontextTask(taskId: string, maxWaitMs = 600_000): Promise<string> {
  const start = Date.now();
  const interval = 3000;
  const deadline = start + maxWaitMs;
  let attempts = 0;
  logKie("fluxKontext.poll.start", { taskId, maxWaitMs });
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    attempts++;
    const res = await fetch(
      `${BASE_URL}/api/v1/flux/kontext/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { "Authorization": `Bearer ${process.env.KIEAI_CODEX_KEY}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      logKieError("fluxKontext.poll.httpError", {
        taskId,
        status: res.status,
        body: text,
        attempts,
        durationMs: Date.now() - start,
      });
      throw new Error(`kie.ai flux-kontext poll ${res.status}: ${text}`);
    }
    const json = await res.json();
    const state = json.data?.state;

    if (state === "success") {
      const resultJson = JSON.parse(json.data.resultJson ?? "{}");
      const urls = resultJson.resultUrls ?? [];
      const outputUrl = urls[0] ?? resultJson.resultImageUrl ?? "";
      logKie("fluxKontext.poll.success", {
        taskId,
        attempts,
        durationMs: Date.now() - start,
      });
      return outputUrl;
    }
    if (state === "fail") {
      logKieError("fluxKontext.poll.fail", {
        taskId,
        attempts,
        durationMs: Date.now() - start,
        failMsg: json.data.failMsg,
      });
      throw new Error(`kie.ai flux-kontext task failed: ${json.data.failMsg || "unknown"}`);
    }
  }
  logKieError("fluxKontext.poll.timeout", {
    taskId,
    attempts,
    durationMs: Date.now() - start,
    maxWaitMs,
  });
  throw new Error("kie.ai flux-kontext task timed out");
}

export const kieaiProvider: IMediaProvider = {
  /**
   * Enhance a real estate photo using nano-banana-pro for improved lighting,
   * color balance, and sharpness at 2K resolution.
   * Model: nano-banana-pro
   */
  async enhanceImage(options: ImageEnhancementOptions): Promise<MediaJobResult> {
    const start = Date.now();
    const model = options.model ?? "nano-banana-pro";

    const taskId = await createTask({
      model,
      input: {
        prompt: options.prompt ?? "Enhance this real estate photo with improved natural lighting, better color balance, sharper details, and professional photography quality. Keep the scene exactly the same.",
        image_input: [options.imageUrl],
        aspect_ratio: "auto",
        resolution: "2K",
        output_format: "jpg",
      },
    });
    if (options.onTaskId) await options.onTaskId(taskId);

    const urls = await pollMarketTask(taskId);
    return {
      outputUrl: urls[0] ?? "",
      provider: "kieai",
      model,
      externalIds: { taskId },
      durationMs: Date.now() - start,
    };
  },

  /**
   * Virtual staging: edit an empty room image to add furniture using Flux Kontext.
   * Uses the dedicated Flux Kontext endpoint (not the unified createTask).
   */
  async virtualStaging(options: VirtualStagingOptions): Promise<MediaJobResult> {
    const start = Date.now();
    const model = options.model ?? "flux-kontext-pro";

    const taskId = await createFluxKontextTask({
      prompt: `Professional interior design, ${options.style ?? "modern"} ${options.roomType.replace("_", " ")}, fully furnished, real estate photography, photorealistic`,
      inputImage: options.imageUrl,
      aspectRatio: "16:9",
      outputFormat: "jpeg",
      model,
      enableTranslation: false,
    });
    if (options.onTaskId) await options.onTaskId(taskId);

    const outputUrl = await pollFluxKontextTask(taskId);
    return {
      outputUrl,
      provider: "kieai",
      model,
      externalIds: { taskId },
      durationMs: Date.now() - start,
    };
  },

  /**
   * Sky replacement: edit an exterior photo to change the sky using Flux Kontext.
   */
  async skyReplacement(options: SkyReplacementOptions): Promise<MediaJobResult> {
    const start = Date.now();
    const model = options.model ?? "flux-kontext-pro";
    const skyPrompts: Record<string, string> = {
      sunset: "dramatic golden sunset sky, warm orange and pink tones",
      blue_sky: "clear bright blue sky with light clouds",
      dramatic: "dramatic stormy sky with rays of light breaking through",
      golden_hour: "golden hour sky, warm soft diffused light",
    };

    const taskId = await createFluxKontextTask({
      prompt: `Real estate exterior photo, replace the sky with ${skyPrompts[options.skyType ?? "blue_sky"]}, photorealistic, keep the building and foreground unchanged`,
      inputImage: options.imageUrl,
      outputFormat: "jpeg",
      model,
      enableTranslation: false,
    });
    if (options.onTaskId) await options.onTaskId(taskId);

    const outputUrl = await pollFluxKontextTask(taskId);
    return {
      outputUrl,
      provider: "kieai",
      model,
      externalIds: { taskId },
      durationMs: Date.now() - start,
    };
  },

  /**
   * Generate a video from an image (or text) using Kling models.
   * Default model: kling-2.5/image-to-video (via unified createTask endpoint).
   */
  async generateVideo(options: VideoGenerationOptions): Promise<MediaJobResult> {
    const start = Date.now();
    // Callers must pass a logical `VideoModel` id; this provider resolves
    // the id to a kie.ai slug internally. No raw-slug passthrough — an
    // unknown value indicates a bug at the call site.
    const requested = options.model ?? "kling";
    const model = VIDEO_MODEL_SLUGS[requested];
    if (!model) {
      throw new Error(
        `kieai.generateVideo: unknown video model "${requested}". Expected one of: ${Object.keys(VIDEO_MODEL_SLUGS).join(", ")}.`,
      );
    }
    const aspectRatio = options.aspectRatio ?? "16:9";

    // ByteDance Seedance has a distinct input schema from Kling on kie.ai:
    //   - image field is `first_frame_url` (string), not `image_urls` (array)
    //   - `duration` is integer seconds in [4, 15] (not a string)
    //   - `generate_audio` replaces Kling's `sound`; we disable since we mux audio later
    //   - `web_search` is required
    const isSeedance = model.startsWith("bytedance/seedance");

    let input: Record<string, unknown>;

    if (isSeedance) {
      // Seedance's valid duration window is 4-15; clamp to be safe.
      const seedanceDuration = Math.min(
        15,
        Math.max(4, Math.round(options.duration ?? 5))
      );
      // Seedance's API treats `first_frame_url` and `reference_image_urls` as
      // mutually exclusive (kie.ai returns 422 "scene selection" if both are
      // sent). Strategy:
      //   - Prompt uses @imageN tokens -> reference_image_urls (the only
      //     mode that binds those tokens to indices)
      //   - Multiple images            -> reference_image_urls
      //   - Single image, no tokens    -> first_frame_url (i2v: animate this frame)
      // Seedance spec caps reference_image_urls at 9.
      const allRefs = [
        ...(options.imageUrl ? [options.imageUrl] : []),
        ...(options.referenceImageUrls ?? []),
      ]
        .filter((u): u is string => typeof u === "string" && u.length > 0)
        .slice(0, 9);
      const hasMentions = /@image\d+/i.test(options.prompt ?? "");
      const useReferenceMode =
        (options.referenceImageUrls?.length ?? 0) > 0 ||
        (hasMentions && allRefs.length > 0);
      // Cleanup pass: strip dangling @imageN tokens (any index > available
      // refs) and normalize whitespace. The historical LLM enrichment step
      // was removed — all current callers already ship fully-authored
      // prompts via Claude Sonnet, so the extra enrichment call was pure
      // cost/latency overhead.
      const seedancePrompt = await translatePromptForSeedance(
        options.prompt,
        { imageCount: allRefs.length },
        { log: logKie },
      );
      logKie("seedance.inputMode", {
        mode: useReferenceMode ? "reference" : "firstFrame",
        imageCount: allRefs.length || (options.imageUrl ? 1 : 0),
        hasMentions,
      });
      input = {
        prompt: seedancePrompt,
        aspect_ratio: aspectRatio,
        duration: seedanceDuration,
        resolution: options.resolution ?? "720p",
        generate_audio: false,
        web_search: false,
        nsfw_checker: false,
        ...(useReferenceMode
          ? { reference_image_urls: allRefs }
          : options.imageUrl
            ? { first_frame_url: options.imageUrl }
            : {}),
      };
    } else {
      // Kling 2.x image-to-video, single-shot. Multi-shot videos fan out at
      // the orchestrator layer — each scene is its own generateVideo call and
      // the results are concatenated by ffmpeg.
      //
      // kie.ai Kling 2.6 i2v input schema (see
      // https://docs.kie.ai/market/kling/image-to-video). The 3.0 schema
      // listed at https://docs.kie.ai/market/kling/kling-3-0 is identical
      // for the fields we use, so this branch will keep working when the
      // 3.0 slug is enabled in `VIDEO_MODEL_SLUGS`:
      //   prompt        (required, single-shot)
      //   image_urls    (array — [first_frame] for i2v, or [first, end] for transitions)
      //   duration      (string, "5" or "10" on 2.6; 3.0 supports "3"-"15")
      //   aspect_ratio  ("16:9" | "9:16" | "1:1")
      //   mode          ("std" → 720p | "pro" → 1080p)
      //   sound         (optional bool)
      // `negative_prompt` and `cfg_scale` aren't documented for 2.6/3.0 i2v
      // and have been dropped. The scene generator still computes those
      // override values for the retry path but they go nowhere on this
      // branch — cleanup is a follow-up.
      //
      // Resolution: forced to "std" (= 720p) per current product decision.
      // To enable 1080p later, replace the hardcode with `options.mode`
      // (the scene generator already injects modelParams.mode into opts).
      if (!options.imageUrl) {
        throw new Error(
          "kieai.generateVideo: Kling i2v requires imageUrl",
        );
      }
      // Provider-layer safety net for the historical 5s pin. Kling 3.0
      // accepts 3-15s; the scene generator's clampDuration() still pins to
      // 5 to keep cost predictable. Reading options.duration so a future
      // relaxation doesn't need a provider-side change.
      const duration = String(options.duration ?? 5);
      const mode = "std";
      input = {
        prompt:
          options.prompt ??
          "Slow cinematic camera movement, real estate property walkthrough",
        image_urls: [options.imageUrl],
        duration,
        aspect_ratio: aspectRatio,
        mode,
        // Audio is always off at the generation step; music/voiceover are
        // muxed in a later phase by the engine merge step.
        sound: false,
      };
      logKie("kling.params", {
        mode,
        duration,
        aspectRatio,
      });
    }

    const taskId = await createTask({ model, input });
    if (options.onTaskId) await options.onTaskId(taskId);

    const urls = await pollMarketTask(taskId);
    return {
      outputUrl: urls[0] ?? "",
      provider: "kieai",
      model,
      externalIds: { taskId },
      durationMs: Date.now() - start,
    };
  },
};
