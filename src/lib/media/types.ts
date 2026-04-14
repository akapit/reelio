export type MediaProvider = "kieai" | "piapi";

/**
 * Provider-agnostic logical identifier for a video model. Callers across the
 * app pass one of these strings; each provider implementation owns the
 * mapping from logical id → its own upstream slug (e.g. kie.ai's
 * `bytedance/seedance-2`). Adding a new provider (e.g. piapi.ai) should NOT
 * require changing this union — only adding a new provider-internal map.
 */
export type VideoModel = "kling" | "seedance" | "seedance-fast";

/**
 * Optional callback invoked by a provider the moment it gets an external task
 * ID from the upstream service, BEFORE polling. Critical for debuggability:
 * most failures happen during polling, so persisting the task ID here lets a
 * caller correlate a timed-out/failed run with the upstream task record.
 */
export type OnTaskIdCallback = (taskId: string) => void | Promise<void>;

export interface ImageEnhancementOptions {
  imageUrl: string;
  strength?: number;
  model?: string;
  prompt?: string;
  onTaskId?: OnTaskIdCallback;
}
export interface VirtualStagingOptions {
  imageUrl: string;
  roomType: "living_room" | "bedroom" | "kitchen" | "bathroom" | "office";
  style?: "modern" | "classic" | "scandinavian" | "luxury";
  model?: string;
  onTaskId?: OnTaskIdCallback;
}
export interface SkyReplacementOptions {
  imageUrl: string;
  skyType?: "sunset" | "blue_sky" | "dramatic" | "golden_hour";
  model?: string;
  onTaskId?: OnTaskIdCallback;
}
export interface VideoGenerationOptions {
  prompt?: string;
  imageUrl?: string;
  /** Additional reference images (beyond `imageUrl`). Used by Seedance's
   * `reference_image_urls` (max 9 per kie.ai spec). */
  referenceImageUrls?: string[];
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  quality?: "fast" | "quality";
  /**
   * Logical video-model id (provider-agnostic). Each `IMediaProvider`
   * implementation resolves this to its own upstream slug internally — do
   * NOT pass a raw provider slug here. Unknown values will throw at the
   * provider boundary.
   */
  model?: VideoModel;
  onTaskId?: OnTaskIdCallback;
}
export interface MediaJobResult {
  outputUrl: string;
  provider: MediaProvider;
  model: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
  /** Upstream-service identifiers for debugging/correlation. */
  externalIds?: {
    taskId?: string;
    [key: string]: string | undefined;
  };
}
export interface IMediaProvider {
  enhanceImage(options: ImageEnhancementOptions): Promise<MediaJobResult>;
  virtualStaging(options: VirtualStagingOptions): Promise<MediaJobResult>;
  skyReplacement(options: SkyReplacementOptions): Promise<MediaJobResult>;
  generateVideo(options: VideoGenerationOptions): Promise<MediaJobResult>;
}
