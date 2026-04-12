export type MediaProvider = "kieai" | "replicate" | "fal";

export interface ImageEnhancementOptions {
  imageUrl: string;
  strength?: number;
  model?: string;
  prompt?: string;
}
export interface VirtualStagingOptions {
  imageUrl: string;
  roomType: "living_room" | "bedroom" | "kitchen" | "bathroom" | "office";
  style?: "modern" | "classic" | "scandinavian" | "luxury";
  model?: string;
}
export interface SkyReplacementOptions {
  imageUrl: string;
  skyType?: "sunset" | "blue_sky" | "dramatic" | "golden_hour";
  model?: string;
}
export interface VideoGenerationOptions {
  prompt?: string;
  imageUrl?: string;
  duration?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  quality?: "fast" | "quality";
  model?: string;
}
export interface MediaJobResult {
  outputUrl: string;
  provider: MediaProvider;
  model: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}
export interface IMediaProvider {
  enhanceImage(options: ImageEnhancementOptions): Promise<MediaJobResult>;
  virtualStaging(options: VirtualStagingOptions): Promise<MediaJobResult>;
  skyReplacement(options: SkyReplacementOptions): Promise<MediaJobResult>;
  generateVideo(options: VideoGenerationOptions): Promise<MediaJobResult>;
}
