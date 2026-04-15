import { kieaiProvider } from "./providers/kieai";
import { piapiProvider } from "./providers/piapi";
import type { IMediaProvider, MediaProvider } from "./types";

const providers: Record<MediaProvider, IMediaProvider> = {
  kieai: kieaiProvider,
  piapi: piapiProvider,
};

const DEFAULT_PROVIDER: MediaProvider = "piapi";

/**
 * Per-task provider routing. Every capability now defaults to piapi.ai.
 * Flip an entry back to `"kieai"` if you need the legacy provider for
 * a specific task.
 */
const TASK_PROVIDER_MAP: Partial<Record<string, MediaProvider>> = {
  "enhance-image":   "piapi",
  "virtual-staging": "piapi",
  "sky-replacement": "piapi",
  "generate-video":  "piapi",
};

export function getProvider(task?: string): IMediaProvider {
  const key = (task ? TASK_PROVIDER_MAP[task] : null) ?? DEFAULT_PROVIDER;
  return providers[key];
}

export * from "./types";
