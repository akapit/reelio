import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Scene, ScenePrompt as ScenePromptType } from "../models";
import { ScenePrompt, VideoModelChoice } from "../models";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WriteScenePromptsInput {
  scenes: Scene[];
  templateName: string;
  /** Optional dep injection for tests */
  client?: Anthropic | { messages: Anthropic["messages"] };
  /** Default: "claude-sonnet-4-6" */
  model?: string;
}

export interface WriteScenePromptsResult {
  /** Length matches input scenes, sceneId-aligned */
  prompts: ScenePromptType[];
  anthropicRequestId?: string;
  tokensIn?: number;
  tokensOut?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** true if the LLM failed and we used deterministic fallback */
  fallbackUsed: boolean;
}

export { fallbackPromptFor };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// System prompt (static — eligible for prompt caching)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a real-estate cinematography prompt writer for Kling 2.5 image-to-video (i2v). Your sole job is to produce short, concrete motion prompts that, when fed to the Kling i2v model, produce smooth and visually compelling clips from still real-estate photos.

## Template moods
Match the energy of the template when choosing motion speed, language, and camera behaviour:
- luxury_30s    — Elegant, slow, premium feel. Unhurried dolly moves, warm tones, refined descriptors.
- family_30s    — Warm, inviting. Gentle pans, natural light, approachable energy.
- fast_15s      — Energetic, punchy. Brisk camera moves, dynamic cuts, bold language.
- investor_20s  — Clean, data-forward. Steady push-ins, minimal visual noise, clear framing.
- premium_45s   — Cinematic, unhurried. Wide reveals, long glides, rich atmosphere.

## How Kling i2v works — write for motion, not description
Kling animates a still image. The prompt tells the model what MOTION to create, not what the image looks like. Do NOT describe the room contents — Kling can already see them. Instead describe:
- The camera move (dolly-in, pan left, crane up, orbit, handheld drift, etc.)
- Subject motion you want to emerge (curtains swaying, steam rising, leaves rustling)
- Atmospheric quality (soft warm light, afternoon haze, morning mist)
- Speed and weight (slow and weighted, brisk and light)

## Example prompts
- "Slow dolly-in toward the marble kitchen island, soft warm light, subtle steam rising off the espresso cup, cinematic depth of field."
- "Gentle pan right across the living room, afternoon sun casting long shadows, floating dust motes in the beam, steady and unhurried."
- "Smooth crane reveal from below the roofline, exposing the facade and landscaping, golden-hour glow, premium feel."

## Scene roles
Respect each scene's sceneRole:
- opening  — Establish the property. Wide, inviting reveal move.
- hero     — The money shot. Most compelling room; premium, slow, immersive motion.
- wow      — Surprise the viewer. Slightly more dynamic, unexpected camera path.
- filler   — Pace-setter between highlights. Keep it simple and brief.
- closing  — Send-off. Pull back or settle; create a lasting impression.

## motionIntent
Each scene includes a motionIntent string (hint from the planner). Use it as a starting point — you may refine the phrasing to make it more evocative, but honour the intent.

## Model selection
Choose the generation model per scene:
- kling        — Default for most scenes. Excellent smooth motion from stills.
- seedance     — Use when the scene strongly benefits from rich atmospheric motion (drone shot through window, dramatic exterior reveal, hero scene with complex depth).
- seedance-fast — Use ONLY for short filler scenes where quality matters less than throughput.

Provide a brief modelReason (one line) explaining the choice.

## modelParams
Always include:
- mode: "pro" for hero/wow/opening scenes, "std" for filler/closing.
- cameraMovement: a short slug describing the move (e.g. "dolly-in", "pan-right", "crane-reveal", "static-drift").

## Output format — CRITICAL
Return ONLY a JSON object. No prose, no markdown, no code fences. Exactly this shape:
{
  "prompts": [
    {
      "sceneId": "...",
      "prompt": "...",
      "modelChoice": "kling" | "seedance" | "seedance-fast",
      "modelReason": "...",
      "modelParams": { "mode": "std" | "pro", "cameraMovement": "..." }
    }
  ]
}
The prompts array MUST contain one entry per scene in the request, preserving sceneId exactly.`;

// ---------------------------------------------------------------------------
// Validation schema for the LLM response
// ---------------------------------------------------------------------------

const LLMResponseSchema = z.object({
  prompts: z.array(ScenePrompt),
});

// ---------------------------------------------------------------------------
// Logging helper
// ---------------------------------------------------------------------------

function log(
  event: string,
  data: Record<string, unknown> = {},
): void {
  try {
    console.log(JSON.stringify({ source: "engine.promptWriter", event, ...data }));
  } catch {
    // never throw from logging
  }
}

// ---------------------------------------------------------------------------
// Deterministic fallback
// ---------------------------------------------------------------------------

function fallbackPromptFor(scene: Scene): ScenePromptType {
  const { sceneId, imageRoomType, motionIntent, templateMood, sceneRole, durationSec } = scene;

  // Pick model based on role
  let modelChoice: z.infer<typeof VideoModelChoice> = "kling";
  if (sceneRole === "filler" && durationSec <= 4) {
    modelChoice = "seedance-fast";
  } else if (sceneRole === "hero" || sceneRole === "wow") {
    // Keep kling as default; seedance would need a stronger signal
    modelChoice = "kling";
  }

  // Mode: pro for important scenes
  const mode: "pro" | "std" =
    sceneRole === "hero" || sceneRole === "wow" || sceneRole === "opening" ? "pro" : "std";

  // Derive a sensible camera movement slug from motionIntent
  const intentLower = motionIntent.toLowerCase();
  let cameraMovement = "dolly-in";
  if (intentLower.includes("pan left")) cameraMovement = "pan-left";
  else if (intentLower.includes("pan right")) cameraMovement = "pan-right";
  else if (intentLower.includes("zoom out") || intentLower.includes("pull")) cameraMovement = "pull-back";
  else if (intentLower.includes("zoom in") || intentLower.includes("push")) cameraMovement = "dolly-in";
  else if (intentLower.includes("static")) cameraMovement = "static-drift";
  else if (intentLower.includes("crane") || intentLower.includes("aerial")) cameraMovement = "crane-reveal";

  // Build a mood-aware prefix
  let moodPrefix = "Slow cinematic";
  if (templateMood === "fast_15s") moodPrefix = "Brisk dynamic";
  else if (templateMood === "investor_20s") moodPrefix = "Clean steady";
  else if (templateMood === "luxury_30s" || templateMood === "premium_45s") moodPrefix = "Elegant slow";
  else if (templateMood === "family_30s") moodPrefix = "Warm gentle";

  const prompt =
    `${moodPrefix} ${cameraMovement.replace("-", " ")} across the ${imageRoomType}, ` +
    `${motionIntent}, soft natural light, photorealistic, steady camera.`;

  return {
    sceneId,
    prompt,
    modelChoice,
    modelReason: "deterministic fallback — LLM unavailable",
    modelParams: { mode, cameraMovement },
  };
}

// ---------------------------------------------------------------------------
// JSON extraction (handles prose/code-fence wrapping)
// ---------------------------------------------------------------------------

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // try stripping code fences
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  // Greedy brace extraction
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      // give up
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Align prompts to scene order and fill gaps with fallback
// ---------------------------------------------------------------------------

function alignPrompts(
  raw: ScenePromptType[],
  scenes: Scene[],
): ScenePromptType[] {
  const byId = new Map<string, ScenePromptType>(raw.map((p) => [p.sceneId, p]));
  return scenes.map((s) => byId.get(s.sceneId) ?? fallbackPromptFor(s));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function writeScenePrompts(
  input: WriteScenePromptsInput,
): Promise<WriteScenePromptsResult> {
  const { scenes, templateName, model = DEFAULT_MODEL } = input;

  const client: Anthropic | { messages: Anthropic["messages"] } =
    input.client ?? new Anthropic();

  // Build compact scene briefs — no image bytes, just analysis output
  const sceneBriefs = scenes.map((s) => ({
    sceneId: s.sceneId,
    imageUrl: s.imagePath,
    roomType: s.imageRoomType,
    scores: s.imageScores,
    dominantColorsHex: s.imageDominantColorsHex,
    topLabels: s.imageLabels.slice(0, 5).map((l) => l.name),
    sceneRole: s.sceneRole,
    motionIntent: s.motionIntent,
    durationSec: s.durationSec,
  }));

  const userMessage = JSON.stringify({ templateName, scenes: sceneBriefs }, null, 2);

  log("call.start", {
    model,
    templateName,
    sceneCount: scenes.length,
  });

  // Helper to call the API with an optional retry message appended
  async function callAnthropic(
    extraMessages: Array<{ role: "user" | "assistant"; content: string }> = [],
  ): Promise<Anthropic.Message> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
      ...extraMessages,
    ];

    // Prompt caching: `cache_control` is not in this SDK version's TextBlockParam
    // type, but the API accepts it at runtime regardless of beta header. The
    // args object is built untyped and passed as `any` to bypass the strict
    // excess-property check at the call site only.
    const params = {
      model,
      max_tokens: 4096,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return client.messages.create(params as any) as Promise<Anthropic.Message>;
  }

  interface UsageMeta {
    tokensIn: number | undefined;
    tokensOut: number | undefined;
    cacheReadTokens: number | undefined;
    cacheWriteTokens: number | undefined;
  }

  const EMPTY_USAGE: UsageMeta = {
    tokensIn: undefined,
    tokensOut: undefined,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  };

  function toRecord(x: unknown): Record<string, unknown> | undefined {
    return x && typeof x === "object" ? (x as Record<string, unknown>) : undefined;
  }

  function pickNumber(v: unknown): number | undefined {
    return typeof v === "number" ? v : undefined;
  }

  // Extract usage metrics from a response
  function extractUsage(resp: Anthropic.Message): UsageMeta {
    const u = toRecord(resp.usage);
    if (!u) return { ...EMPTY_USAGE };
    return {
      tokensIn: pickNumber(u.input_tokens),
      tokensOut: pickNumber(u.output_tokens),
      cacheReadTokens: pickNumber(u.cache_read_input_tokens),
      cacheWriteTokens: pickNumber(u.cache_creation_input_tokens),
    };
  }

  // Get the text content from a response
  function getText(resp: Anthropic.Message): string {
    for (const block of resp.content ?? []) {
      if (block.type === "text") return block.text;
    }
    return "";
  }

  // Try to validate parsed JSON against the schema
  function validate(
    parsed: unknown,
  ): z.SafeParseReturnType<unknown, { prompts: ScenePromptType[] }> {
    return LLMResponseSchema.safeParse(parsed);
  }

  let resp: Anthropic.Message;
  let usageMeta: UsageMeta = { ...EMPTY_USAGE };
  let anthropicRequestId: string | undefined;

  // --- Attempt 1 ---
  try {
    resp = await callAnthropic();
    usageMeta = extractUsage(resp);
    // Message.id is not typed on all SDK versions; probe via the record helper.
    const respRec = toRecord(resp);
    anthropicRequestId =
      respRec && typeof respRec.id === "string" ? respRec.id : undefined;

    const text = getText(resp);
    const parsed = extractJson(text);
    const validation = validate(parsed);

    if (validation.success) {
      const prompts = alignPrompts(validation.data.prompts, scenes);
      log("call.success", {
        model,
        sceneCount: scenes.length,
        ...usageMeta,
      });
      return {
        prompts,
        anthropicRequestId,
        ...usageMeta,
        fallbackUsed: false,
      };
    }

    // Validation failed — log and retry once
    log("call.validationFailed", {
      model,
      attempt: 1,
      error: validation.error.message,
      rawPreview: text.slice(0, 300),
    });

    // --- Attempt 2 (retry with nudge) ---
    log("call.retried", { model, attempt: 2 });
    try {
      const retryResp = await callAnthropic([
        { role: "assistant", content: text },
        {
          role: "user",
          content:
            "Your previous response failed JSON validation. Return ONLY the JSON object with no prose, no markdown, no code fences. The shape must be exactly: { \"prompts\": [ { \"sceneId\": \"...\", \"prompt\": \"...\", \"modelChoice\": \"kling\"|\"seedance\"|\"seedance-fast\", \"modelReason\": \"...\", \"modelParams\": { \"mode\": \"std\"|\"pro\", \"cameraMovement\": \"...\" } } ] }",
        },
      ]);

      const retryUsage = extractUsage(retryResp);
      // Merge tokens: prefer retry values but keep first-attempt where retry is absent
      const mergedUsage = {
        tokensIn:
          retryUsage.tokensIn !== undefined
            ? (usageMeta.tokensIn ?? 0) + retryUsage.tokensIn
            : usageMeta.tokensIn,
        tokensOut:
          retryUsage.tokensOut !== undefined
            ? (usageMeta.tokensOut ?? 0) + retryUsage.tokensOut
            : usageMeta.tokensOut,
        cacheReadTokens: retryUsage.cacheReadTokens ?? usageMeta.cacheReadTokens,
        cacheWriteTokens: retryUsage.cacheWriteTokens ?? usageMeta.cacheWriteTokens,
      };
      usageMeta = mergedUsage;

      const retryText = getText(retryResp);
      const retryParsed = extractJson(retryText);
      const retryValidation = validate(retryParsed);

      if (retryValidation.success) {
        const prompts = alignPrompts(retryValidation.data.prompts, scenes);
        log("call.success", {
          model,
          sceneCount: scenes.length,
          attempt: 2,
          ...usageMeta,
        });
        return {
          prompts,
          anthropicRequestId,
          ...usageMeta,
          fallbackUsed: false,
        };
      }

      log("call.validationFailed", {
        model,
        attempt: 2,
        error: retryValidation.error.message,
        rawPreview: retryText.slice(0, 300),
      });
    } catch (retryErr) {
      log("call.validationFailed", {
        model,
        attempt: 2,
        error: retryErr instanceof Error ? retryErr.message : String(retryErr),
      });
    }
  } catch (err) {
    log("call.validationFailed", {
      model,
      attempt: 1,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // --- Deterministic fallback ---
  log("call.fallbackUsed", { model, sceneCount: scenes.length, ...usageMeta });
  const prompts = scenes.map(fallbackPromptFor);
  return {
    prompts,
    anthropicRequestId,
    ...usageMeta,
    fallbackUsed: true,
  };
}
