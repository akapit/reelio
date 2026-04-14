import { kieaiProvider } from "./providers/kieai";
import { piapiProvider } from "./providers/piapi";
import type { IMediaProvider, MediaProvider } from "./types";

const providers: Record<MediaProvider, IMediaProvider> = {
  kieai: kieaiProvider,
  piapi: piapiProvider,
};

const DEFAULT_PROVIDER: MediaProvider = "kieai";

/**
 * Per-task provider routing. Flip any entry to `"piapi"` to move that
 * capability to piapi.ai without touching the calling trigger task.
 */
const TASK_PROVIDER_MAP: Partial<Record<string, MediaProvider>> = {
  "enhance-image":   "kieai",
  "virtual-staging": "kieai",
  "sky-replacement": "kieai",
  "generate-video":  "kieai",
};

export function getProvider(task?: string): IMediaProvider {
  const key = (task ? TASK_PROVIDER_MAP[task] : null) ?? DEFAULT_PROVIDER;
  return providers[key];
}

export * from "./types";
