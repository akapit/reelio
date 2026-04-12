import type {
  IMediaProvider, MediaJobResult,
  ImageEnhancementOptions, VirtualStagingOptions,
  SkyReplacementOptions, VideoGenerationOptions
} from "../types";

const BASE_URL = "https://api.kie.ai";

/** Shared headers for all kie.ai requests */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.KIEAI_API_KEY}`,
    ...extra,
  };
}

/** POST to the unified Market createTask endpoint */
async function createTask(body: { model: string; callBackUrl?: string; input: Record<string, unknown> }) {
  const res = await fetch(`${BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`kie.ai createTask ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(`kie.ai createTask error ${json.code}: ${json.msg}`);
  return json.data.taskId as string;
}

/** POST to the Flux Kontext generation endpoint (separate from unified createTask) */
async function createFluxKontextTask(body: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/api/v1/flux/kontext/generate`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`kie.ai flux-kontext ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(`kie.ai flux-kontext error ${json.code}: ${json.msg}`);
  return json.data.taskId as string;
}

/**
 * Poll the unified Market task status endpoint until success or failure.
 * Task states: waiting -> queuing -> generating -> success | fail
 */
async function pollMarketTask(taskId: string, maxWaitMs = 600_000): Promise<string[]> {
  const interval = 3000;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    const res = await fetch(`${BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { "Authorization": `Bearer ${process.env.KIEAI_API_KEY}` },
    });
    if (!res.ok) throw new Error(`kie.ai poll ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const state = json.data?.state;

    if (state === "success") {
      const resultJson = JSON.parse(json.data.resultJson ?? "{}");
      return resultJson.resultUrls ?? [];
    }
    if (state === "fail") {
      throw new Error(`kie.ai task failed: ${json.data.failMsg || json.data.failCode || "unknown"}`);
    }
    // waiting, queuing, generating -> keep polling
  }
  throw new Error("kie.ai task timed out");
}

/** Poll the Flux Kontext task status endpoint */
async function pollFluxKontextTask(taskId: string, maxWaitMs = 600_000): Promise<string> {
  const interval = 3000;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    const res = await fetch(
      `${BASE_URL}/api/v1/flux/kontext/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { "Authorization": `Bearer ${process.env.KIEAI_API_KEY}` } },
    );
    if (!res.ok) throw new Error(`kie.ai flux-kontext poll ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const state = json.data?.state;

    if (state === "success") {
      const resultJson = JSON.parse(json.data.resultJson ?? "{}");
      const urls = resultJson.resultUrls ?? [];
      return urls[0] ?? resultJson.resultImageUrl ?? "";
    }
    if (state === "fail") {
      throw new Error(`kie.ai flux-kontext task failed: ${json.data.failMsg || "unknown"}`);
    }
  }
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

    const urls = await pollMarketTask(taskId);
    return {
      outputUrl: urls[0] ?? "",
      provider: "kieai",
      model,
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

    const outputUrl = await pollFluxKontextTask(taskId);
    return {
      outputUrl,
      provider: "kieai",
      model,
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

    const outputUrl = await pollFluxKontextTask(taskId);
    return {
      outputUrl,
      provider: "kieai",
      model,
      durationMs: Date.now() - start,
    };
  },

  /**
   * Generate a video from an image (or text) using Kling models.
   * Default model: kling-2.6/image-to-video (via unified createTask endpoint).
   */
  async generateVideo(options: VideoGenerationOptions): Promise<MediaJobResult> {
    const start = Date.now();
    const model = options.model ?? "kling-2.6/image-to-video";
    const duration = String(options.duration ?? 5);
    const aspectRatio = options.aspectRatio ?? "16:9";

    // Build input based on whether we have an image (image-to-video) or not (text-to-video)
    let input: Record<string, unknown>;

    if (options.imageUrl) {
      // Kling 2.6 image-to-video uses image_urls (array), V2.5 uses image_url (string)
      const isV25 = model.includes("v2-5") || model.includes("v2.5");
      input = {
        prompt: options.prompt ?? "Slow cinematic camera movement, real estate property walkthrough",
        sound: false,
        duration,
        ...(isV25
          ? { image_url: options.imageUrl, cfg_scale: 0.5 }
          : { image_urls: [options.imageUrl] }),
      };
    } else {
      // Text-to-video: include aspect_ratio
      input = {
        prompt: options.prompt ?? "Cinematic real estate property exterior",
        sound: false,
        aspect_ratio: aspectRatio,
        duration,
      };
    }

    const taskId = await createTask({ model, input });
    const urls = await pollMarketTask(taskId);
    return {
      outputUrl: urls[0] ?? "",
      provider: "kieai",
      model,
      durationMs: Date.now() - start,
    };
  },
};
