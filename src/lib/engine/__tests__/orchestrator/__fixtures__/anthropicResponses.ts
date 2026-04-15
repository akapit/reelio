import type Anthropic from "@anthropic-ai/sdk";

export type ScriptedStep =
  | {
      type: "tool_use";
      toolUses: Array<{ id: string; name: string; input: unknown }>;
    }
  | { type: "end_turn"; text: string }
  | { type: "raw"; stop_reason: string | null; content: unknown[] };

export interface ScriptedClient extends Pick<Anthropic, "messages"> {
  __callCount: () => number;
  __calls: () => unknown[];
}

export function makeScriptedClient(steps: ScriptedStep[]): ScriptedClient {
  let i = 0;
  const calls: unknown[] = [];
  const client = {
    __callCount: () => i,
    __calls: () => calls,
    messages: {
      create: async (args: unknown) => {
        calls.push(args);
        const step = steps[i++];
        if (!step) throw new Error("script exhausted");
        if (step.type === "end_turn") {
          return {
            id: `msg_${i}`,
            type: "message",
            role: "assistant",
            model: "scripted",
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
            content: [{ type: "text", text: step.text }],
          };
        }
        if (step.type === "raw") {
          return {
            id: `msg_${i}`,
            type: "message",
            role: "assistant",
            model: "scripted",
            stop_reason: step.stop_reason,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
            content: step.content,
          };
        }
        return {
          id: `msg_${i}`,
          type: "message",
          role: "assistant",
          model: "scripted",
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
          content: step.toolUses.map((t) => ({
            type: "tool_use",
            id: t.id,
            name: t.name,
            input: t.input,
          })),
        };
      },
    },
  } as unknown as ScriptedClient;
  return client;
}

// ---------- canned data ----------

export function fakeDataset(usableCount = 10): unknown {
  const images = Array.from({ length: Math.max(usableCount, 1) }).map((_, i) => ({
    path: `/tmp/img_${i}.jpg`,
    roomType: "living",
    scores: {
      quality: 0.8,
      lighting: 0.8,
      composition: 0.7,
      wow: 0.6,
      detail: 0.7,
      hero: 0.7,
    },
    eligibility: { asHero: true, asWow: true, asClosing: true },
    dims: { width: 1920, height: 1080, aspectRatio: 16 / 9 },
    visionLabels: [],
    dominantColorsHex: [],
  }));
  return {
    images,
    availableRoomTypes: ["living"],
    usableCount,
    analyzedAt: new Date().toISOString(),
  };
}

export function fakeTimeline(): unknown {
  return {
    templateName: "fast_15s",
    targetDurationSec: 15,
    totalDurationSec: 15,
    aspectRatio: "16:9",
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    shots: [
      {
        slotId: "s1",
        order: 0,
        imagePath: "/tmp/img_0.jpg",
        imageRoomType: "living",
        durationSec: 15,
        motion: {
          type: "static",
          startScale: 1,
          endScale: 1,
          startXPct: 0,
          endXPct: 0,
          startYPct: 0,
          endYPct: 0,
        },
        transitionOut: "cut",
        transitionDurationSec: 0,
        overlayText: null,
        fallbackApplied: null,
      },
    ],
    music: { mood: "uplifting", volume: 0.5 },
    overlays: {
      headline: { enabled: false, text: null },
      captions: { enabled: false },
      cta: { enabled: false, text: null },
    },
    unfilledSlotIds: [],
    warnings: [],
  };
}

export function fakeRender(outputPath = "/tmp/out.mp4"): unknown {
  return {
    outputPath,
    durationSec: 15,
    sizeBytes: 12345,
    width: 1920,
    height: 1080,
    codec: "h264",
    renderMs: 1234,
  };
}
