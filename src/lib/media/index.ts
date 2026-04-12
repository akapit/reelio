import { kieaiProvider } from "./providers/kieai";
import type { IMediaProvider, MediaProvider } from "./types";

const providers: Record<MediaProvider, IMediaProvider> = {
  kieai: kieaiProvider,
  replicate: kieaiProvider,   // placeholder — replace when adding Replicate
  fal: kieaiProvider,         // placeholder — replace when adding fal.ai
};

const DEFAULT_PROVIDER: MediaProvider = "kieai";

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
