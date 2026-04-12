import { task } from "@trigger.dev/sdk";
import { getProvider } from "@/lib/media";
import { updateAssetStatus, uploadResultToR2 } from "./_shared";

export const generateVideoTask = task({
  id: "generate-video",
  retry: { maxAttempts: 3 },
  run: async (payload: { assetId: string; originalUrl: string; userId: string; prompt?: string; duration?: number; aspectRatio?: string; quality?: string }) => {
    await updateAssetStatus(payload.assetId, "processing");
    try {
      const provider = getProvider("generate-video");
      const result = await provider.generateVideo({
        imageUrl: payload.originalUrl,
        prompt: payload.prompt,
        duration: payload.duration,
        aspectRatio: payload.aspectRatio as "16:9" | "9:16" | "1:1" | undefined,
        quality: payload.quality as "fast" | "quality" | undefined,
      });
      const storedUrl = await uploadResultToR2(result.outputUrl, payload.userId, "mp4");

      // Update the placeholder: set original_url to the video, keep thumbnail_url as source image
      await updateAssetStatus(payload.assetId, "done", {
        processed_url: storedUrl,
        original_url: storedUrl,
      });

      return { storedUrl, provider: result.provider, model: result.model, durationMs: result.durationMs };
    } catch (error) {
      await updateAssetStatus(payload.assetId, "failed");
      throw error;
    }
  },
});
