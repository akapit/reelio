import { task } from "@trigger.dev/sdk";
import { getProvider } from "@/lib/media";
import { updateAssetStatus, uploadResultToR2 } from "./_shared";

export const virtualStagingTask = task({
  id: "virtual-staging",
  retry: { maxAttempts: 3 },
  run: async (payload: { assetId: string; originalUrl: string; userId: string; roomType: string; style?: string }) => {
    await updateAssetStatus(payload.assetId, "processing");
    try {
      const provider = getProvider("virtual-staging");
      const result = await provider.virtualStaging({
        imageUrl: payload.originalUrl,
        roomType: payload.roomType as "living_room" | "bedroom" | "kitchen" | "bathroom" | "office",
        style: payload.style as "modern" | "classic" | "scandinavian" | "luxury" | undefined,
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
