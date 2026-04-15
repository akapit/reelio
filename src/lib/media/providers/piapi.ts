import type {
  IMediaProvider, MediaJobResult,
  ImageEnhancementOptions, VirtualStagingOptions,
  SkyReplacementOptions, VideoGenerationOptions,
  VideoModel,
} from "../types";
import { translatePromptForSeedance } from "../prompts/seedance";

const BASE_URL = "https://api.piapi.ai";

/**
 * Structured logger for piapi.ai calls. Mirrors `logKie` in kieai.ts — emits
 * single-line JSON so Trigger.dev's console capture shows it as a searchable
 * event. Shape: { source: "piapi", event: "createTask.response", taskId, ... }
 */
function logPiApi(event: string, data: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ source: "piapi", event, ...data }));
  } catch {
    console.log(`[piapi] ${event}`);
  }
}
function logPiApiError(event: string, data: Record<string, unknown>): void {
  try {
    console.error(
      JSON.stringify({ source: "piapi", event, level: "error", ...data }),
    );
  } catch {
    console.error(`[piapi] ${event} (error)`);
  }
}

/**
 * Provider-internal: logical `VideoModel` ids → PiAPI task_type values. Kept
 * private so the IMediaProvider abstraction stays free of provider slugs.
 * Only Seedance variants map 1:1; Kling uses `task_type: "video_generation"`
 * with `input.version: "2.5"` and is handled inline in `generateVideo`.
 */
const PIAPI_SEEDANCE_TASK_TYPES: Record<"seedance" | "seedance-fast", string> = {
  seedance: "seedance-2",
  "seedance-fast": "seedance-2-fast",
};

/** Shared headers for all piapi.ai requests. Uses `X-API-Key`, not Bearer. */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-Key": process.env.PIAPI_API_KEY ?? "",
    ...extra,
  };
}

/**
 * Extract a short, non-sensitive summary of the inputs sent so error logs
 * can point at the offending image URL without dumping the entire prompt.
 */
function summarizePiApiInput(input: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  const imageFields = ["image_url", "image_urls", "image"];
  for (const k of imageFields) {
    if (input[k] !== undefined) summary[k] = input[k];
  }
  if (typeof input.prompt === "string") {
    summary.promptPreview = input.prompt.slice(0, 120);
    summary.promptLength = input.prompt.length;
  }
  if (input.duration !== undefined) summary.duration = input.duration;
  if (typeof input.mode === "string") summary.mode = input.mode;
  return summary;
}

/** POST to the unified PiAPI create-task endpoint. Returns the upstream task_id. */
async function createTask(body: {
  model: string;
  task_type: string;
  input: Record<string, unknown>;
  config?: Record<string, unknown>;
}): Promise<string> {
  const start = Date.now();
  const modelTag = `${body.model}:${body.task_type}`;
  logPiApi("createTask.request", { model: body.model, task_type: body.task_type });
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/v1/task`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
  } catch (err) {
    logPiApiError("createTask.networkError", {
      model: modelTag,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
      inputSummary: summarizePiApiInput(body.input),
    });
    throw err;
  }
  if (!res.ok) {
    const text = await res.text();
    const inputSummary = summarizePiApiInput(body.input);
    logPiApiError("createTask.httpError", {
      model: modelTag,
      status: res.status,
      body: text,
      durationMs: Date.now() - start,
      inputSummary,
    });
    throw new Error(
      `piapi createTask ${res.status}: ${text} [model=${modelTag}, input=${JSON.stringify(inputSummary)}]`,
    );
  }
  const json = await res.json();
  if (json.code !== 200) {
    const inputSummary = summarizePiApiInput(body.input);
    logPiApiError("createTask.apiError", {
      model: modelTag,
      code: json.code,
      message: json.message,
      durationMs: Date.now() - start,
      inputSummary,
    });
    throw new Error(
      `piapi createTask error ${json.code}: ${json.message} [model=${modelTag}, input=${JSON.stringify(inputSummary)}]`,
    );
  }
  const taskId = json.data?.task_id as string;
  if (!taskId) {
    throw new Error(`piapi createTask: missing task_id in response: ${JSON.stringify(json)}`);
  }
  logPiApi("createTask.response", {
    taskId,
    model: modelTag,
    durationMs: Date.now() - start,
  });
  return taskId;
}

/** PiAPI status enum is inconsistently cased across docs. Normalize. */
function normalizeStatus(raw: unknown): string {
  return typeof raw === "string" ? raw.toLowerCase() : "";
}

/**
 * Poll PiAPI's unified get-task endpoint until terminal (`completed` | `failed`).
 * Returns the `data.output` object; callers pick the right field per model.
 */
async function pollTask(taskId: string, maxWaitMs = 1_500_000): Promise<Record<string, unknown>> {
  const start = Date.now();
  const interval = 3000;
  const deadline = start + maxWaitMs;
  let attempts = 0;
  logPiApi("pollTask.start", { taskId, maxWaitMs });
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    attempts++;
    const res = await fetch(
      `${BASE_URL}/api/v1/task/${encodeURIComponent(taskId)}`,
      { headers: { "X-API-Key": process.env.PIAPI_API_KEY ?? "" } },
    );
    if (!res.ok) {
      const text = await res.text();
      logPiApiError("pollTask.httpError", {
        taskId,
        status: res.status,
        body: text,
        attempts,
        durationMs: Date.now() - start,
      });
      throw new Error(`piapi poll ${res.status}: ${text}`);
    }
    const json = await res.json();
    if (json.code !== 200) {
      logPiApiError("pollTask.apiError", {
        taskId,
        code: json.code,
        message: json.message,
        attempts,
        durationMs: Date.now() - start,
      });
      throw new Error(`piapi poll error ${json.code}: ${json.message}`);
    }
    const data = json.data ?? {};
    const status = normalizeStatus(data.status);
    const errorObj = data.error as { code?: number; message?: string } | undefined;

    if (status === "completed") {
      // Defensive: some tasks report completed but still carry a non-zero
      // error code per PiAPI docs — treat that as failure.
      if (errorObj?.code && errorObj.code !== 0) {
        logPiApiError("pollTask.completedWithError", {
          taskId,
          attempts,
          durationMs: Date.now() - start,
          errorCode: errorObj.code,
          errorMessage: errorObj.message,
        });
        throw new Error(
          `piapi task completed with error ${errorObj.code}: ${errorObj.message ?? "unknown"}`,
        );
      }
      logPiApi("pollTask.success", {
        taskId,
        attempts,
        durationMs: Date.now() - start,
      });
      return (data.output as Record<string, unknown>) ?? {};
    }
    if (status === "failed") {
      logPiApiError("pollTask.fail", {
        taskId,
        attempts,
        durationMs: Date.now() - start,
        errorCode: errorObj?.code,
        errorMessage: errorObj?.message,
      });
      throw new Error(`piapi task failed: ${errorObj?.message ?? "unknown"}`);
    }
    // pending | processing | staged -> keep polling
  }
  logPiApiError("pollTask.timeout", {
    taskId,
    attempts,
    durationMs: Date.now() - start,
    maxWaitMs,
  });
  throw new Error("piapi task timed out");
}

/**
 * Kling's output shape varies by variant. Canonical forms:
 *   - Kling Turbo / some versions: `output.video` (string)
 *   - Standard Kling / Motion Control: `output.works[0].video.resource_without_watermark`
 *     (or `.resource` as fallback)
 */
function extractVideoUrl(output: Record<string, unknown>): string {
  if (typeof output.video === "string" && output.video) {
    return output.video;
  }
  const works = output.works as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(works) && works[0]) {
    const video = works[0].video as Record<string, unknown> | undefined;
    if (video) {
      if (typeof video.resource_without_watermark === "string" && video.resource_without_watermark) {
        return video.resource_without_watermark;
      }
      if (typeof video.resource === "string" && video.resource) {
        return video.resource;
      }
    }
  }
  return "";
}

/** Nano Banana Pro / Kontext may return `image_url` or `image_urls[0]`. */
function extractImageUrl(output: Record<string, unknown>): string {
  if (typeof output.image_url === "string" && output.image_url) {
    return output.image_url;
  }
  const arr = output.image_urls as unknown;
  if (Array.isArray(arr) && typeof arr[0] === "string") {
    return arr[0];
  }
  return "";
}

export const piapiProvider: IMediaProvider = {
  /**
   * Enhance a real estate photo using Nano Banana Pro (Gemini 3 Pro Image)
   * via PiAPI. Same underlying Google model as our kie.ai enhancement path.
   */
  async enhanceImage(options: ImageEnhancementOptions): Promise<MediaJobResult> {
    const start = Date.now();
    const model = options.model ?? "nano-banana-pro";

    const taskId = await createTask({
      model: "gemini",
      task_type: "nano-banana-pro",
      input: {
        prompt:
          options.prompt ??
          "Enhance this real estate photo with improved natural lighting, better color balance, sharper details, and professional photography quality. Keep the scene exactly the same.",
        image_urls: [options.imageUrl],
        output_format: "jpeg",
        resolution: "2K",
        aspect_ratio: "16:9",
      },
    });
    if (options.onTaskId) await options.onTaskId(taskId);

    const output = await pollTask(taskId);
    return {
      outputUrl: extractImageUrl(output),
      provider: "piapi",
      model,
      externalIds: { taskId },
      durationMs: Date.now() - start,
    };
  },

  /**
   * Virtual staging via Flux Kontext (Qubico-packaged). Note: PiAPI does not
   * expose distinct Pro/Max/Dev tiers through the unified API — quality may
   * differ from kie.ai's Flux Kontext Pro endpoint for interior scenes.
   */
  async virtualStaging(options: VirtualStagingOptions): Promise<MediaJobResult> {
    const start = Date.now();
    const model = options.model ?? "flux-kontext-pro";

    const taskId = await createTask({
      model: "Qubico/flux1-dev-advanced",
      task_type: "kontext",
      input: {
        prompt: `Professional interior design, ${options.style ?? "modern"} ${options.roomType.replace("_", " ")}, fully furnished, real estate photography, photorealistic`,
        image: options.imageUrl,
        // PiAPI Kontext requires explicit dimensions (no aspect_ratio knob).
        // 1344x768 is a common 16:9 Flux resolution for landscape real-estate.
        width: 1344,
        height: 768,
      },
    });
    if (options.onTaskId) await options.onTaskId(taskId);

    const output = await pollTask(taskId);
    return {
      outputUrl: extractImageUrl(output),
      provider: "piapi",
      model,
      externalIds: { taskId },
      durationMs: Date.now() - start,
    };
  },

  /**
   * Sky replacement via Flux Kontext. Same endpoint as virtual staging;
   * only the prompt differs.
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

    const taskId = await createTask({
      model: "Qubico/flux1-dev-advanced",
      task_type: "kontext",
      input: {
        prompt: `Real estate exterior photo, replace the sky with ${skyPrompts[options.skyType ?? "blue_sky"]}, photorealistic, keep the building and foreground unchanged`,
        image: options.imageUrl,
        width: 1344,
        height: 768,
      },
    });
    if (options.onTaskId) await options.onTaskId(taskId);

    const output = await pollTask(taskId);
    return {
      outputUrl: extractImageUrl(output),
      provider: "piapi",
      model,
      externalIds: { taskId },
      durationMs: Date.now() - start,
    };
  },

  /**
   * Generate a video from an image (or text) via PiAPI. Routes to Kling 2.5
   * or Seedance 2 (standard or fast) based on the logical `VideoModel` id.
   */
  async generateVideo(options: VideoGenerationOptions): Promise<MediaJobResult> {
    const start = Date.now();
    const requested: VideoModel = options.model ?? "kling";
    const aspectRatio = options.aspectRatio ?? "16:9";

    if (requested === "kling") {
      // Kling 2.5 image-to-video. PiAPI uses singular `image_url` string;
      // omit it for text-to-video.
      const duration = options.duration ?? 5;
      const input: Record<string, unknown> = {
        prompt:
          options.prompt ??
          "Slow cinematic camera movement, real estate property walkthrough",
        negative_prompt: "",
        // PiAPI Kling expects a JSON number (float64), not a string. The
        // docs example quotes it, but the server rejects strings with
        // `cannot unmarshal string into ... cfg_scale of type float64`.
        cfg_scale: 0.5,
        duration,
        aspect_ratio: aspectRatio,
        mode: "std",
        version: "2.5",
        enable_audio: false,
        ...(options.imageUrl ? { image_url: options.imageUrl } : {}),
      };

      const taskId = await createTask({
        model: "kling",
        task_type: "video_generation",
        input,
      });
      if (options.onTaskId) await options.onTaskId(taskId);

      const output = await pollTask(taskId);
      return {
        outputUrl: extractVideoUrl(output),
        provider: "piapi",
        model: "kling-2.5/image-to-video",
        externalIds: { taskId },
        durationMs: Date.now() - start,
      };
    }

    // Seedance 2 / Seedance 2 Fast. PiAPI replaces kie.ai's `first_frame_url`
    // vs `reference_image_urls` mutex with a single `image_urls` array plus
    // a `mode` enum. Spec cap is 12 references.
    const task_type = PIAPI_SEEDANCE_TASK_TYPES[requested];
    const seedanceDuration = Math.min(
      15,
      Math.max(4, Math.round(options.duration ?? 5)),
    );
    const allRefs = [
      ...(options.imageUrl ? [options.imageUrl] : []),
      ...(options.referenceImageUrls ?? []),
    ]
      .filter((u): u is string => typeof u === "string" && u.length > 0)
      .slice(0, 12);
    const hasMentions = /@image\d+/i.test(options.prompt ?? "");
    const useOmni = allRefs.length > 1 || (hasMentions && allRefs.length > 0);
    const mode: "text_to_video" | "first_last_frames" | "omni_reference" =
      allRefs.length === 0
        ? "text_to_video"
        : useOmni
          ? "omni_reference"
          : "first_last_frames";

    const seedancePrompt = await translatePromptForSeedance(
      options.prompt,
      { duration: seedanceDuration, imageCount: allRefs.length },
      { log: logPiApi },
    );
    logPiApi("seedance.inputMode", {
      mode,
      imageCount: allRefs.length,
      hasMentions,
      task_type,
    });

    const input: Record<string, unknown> = {
      prompt: seedancePrompt,
      mode,
      duration: seedanceDuration,
      ...(allRefs.length > 0 ? { image_urls: allRefs } : {}),
      // `aspect_ratio` is ignored by PiAPI in `first_last_frames` mode
      // (auto-derived from the image). Include it in the other modes.
      ...(mode !== "first_last_frames" ? { aspect_ratio: aspectRatio } : {}),
    };

    const taskId = await createTask({
      model: "seedance",
      task_type,
      input,
    });
    if (options.onTaskId) await options.onTaskId(taskId);

    const output = await pollTask(taskId);
    return {
      outputUrl: extractVideoUrl(output),
      provider: "piapi",
      model:
        requested === "seedance-fast"
          ? "bytedance/seedance-2-fast"
          : "bytedance/seedance-2",
      externalIds: { taskId },
      durationMs: Date.now() - start,
    };
  },
};
