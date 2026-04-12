import { task } from "@trigger.dev/sdk";
import { getProvider } from "@/lib/media";
import { updateAssetStatus, uploadResultToR2 } from "./_shared";

export const enhanceImageTask = task({
  id: "enhance-image",
  retry: { maxAttempts: 3 },
  run: async (payload: { assetId: string; originalUrl: string; userId: string }) => {
    await updateAssetStatus(payload.assetId, "processing");
    try {
      const provider = getProvider("enhance-image");
      const result = await provider.enhanceImage({ imageUrl: payload.originalUrl });
      const storedUrl = await uploadResultToR2(result.outputUrl, payload.userId);

      // Update the placeholder asset with the result
      await updateAssetStatus(payload.assetId, "done", { processed_url: storedUrl });

      return { storedUrl, provider: result.provider, model: result.model, durationMs: result.durationMs };
    } catch (error) {
      await updateAssetStatus(payload.assetId, "failed");
      throw error;
    }
  },
});
