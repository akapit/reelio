import { task } from "@trigger.dev/sdk";
import { getProvider } from "@/lib/media";
import { updateAssetStatus, uploadResultToR2 } from "./_shared";

export const skyReplacementTask = task({
  id: "sky-replacement",
  retry: { maxAttempts: 3 },
  run: async (payload: { assetId: string; originalUrl: string; userId: string; skyType?: string }) => {
    await updateAssetStatus(payload.assetId, "processing");
    try {
      const provider = getProvider("sky-replacement");
      const result = await provider.skyReplacement({
        imageUrl: payload.originalUrl,
        skyType: payload.skyType as "sunset" | "blue_sky" | "dramatic" | "golden_hour" | undefined,
      });
      const storedUrl = await uploadResultToR2(result.outputUrl, payload.userId);
      await updateAssetStatus(payload.assetId, "done", { processed_url: storedUrl });
      return { storedUrl, provider: result.provider, model: result.model, durationMs: result.durationMs };
    } catch (error) {
      await updateAssetStatus(payload.assetId, "failed");
      throw error;
    }
  },
});
