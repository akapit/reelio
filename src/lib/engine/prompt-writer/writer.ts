import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildAnthropicImageContent } from "@/lib/engine/llm/anthropicImage";
import type { Scene, ScenePrompt as ScenePromptType } from "../models";
import { ScenePrompt, VideoModelChoice } from "../models";
import { anthropicCost } from "../cost/pricing";
import { buildOpeningPromptOverride } from "./openers";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WriteScenePromptsInput {
  scenes: Scene[];
  templateName: string;
  /**
   * The video model every scene will run on (the orchestrator hard-overrides
   * to a single model per run). Drives the system prompt — Kling wants a
   * terse motion-only sentence; Seedance handles richer, slightly longer
   * prompts with atmospheric hints. Default: "kling".
   */
  targetModel?: "kling" | "seedance" | "seedance-fast";
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
  /** Estimated USD cost of the Anthropic call(s), 0 if no tokens were spent. */
  costUsd: number;
  /** true if the LLM failed and we used deterministic fallback */
  fallbackUsed: boolean;
}

export { fallbackPromptFor };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// System prompts — one per target video model.
//
// The orchestrator hard-overrides every scene to ONE model per run (env:
// ENGINE_DEFAULT_MODEL, default "kling"). We pick the system prompt that
// matches that model's prompt-style sensibilities:
//
//   • Kling 2.5 — rewards terse, motion-only sentences. Long atmospheric
//     prose produces flatter / more jittery output. Best practices docs
//     emphasize "camera verb + subject, minimal adjectives".
//
//   • Seedance 2 — the model actually prefers richer prompts. The kie.ai
//     seedance adapter already has a tier-2 LLM translator that enriches
//     terse prompts, so writing short prompts here means the translator
//     will fire more often and add its own description — effectively
//     undoing the "short prompt" goal. Instead, give Seedance 1-2 sentences
//     with atmosphere, subject hint, and speed.
//
// Both system prompts share the same JSON output contract so the downstream
// parser needs no change.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_KLING = `You write motion prompts for Kling 2.5 image-to-video.

## Storyboard mindset — READ FIRST
You are writing ALL the scenes for ONE short real-estate tour video in a single
pass. Before writing any prompt, read the "Storyboard" block in the user
message: it lists every scene in order with role + room type. Then write the
prompts as a COHERENT SEQUENCE, not as isolated sentences.

Continuity rules:
1. VARY camera movements across the sequence. Repeating the same verb in
   consecutive scenes is a failure mode. Rotate through the verb list below.
2. Opening and closing are EVENTS — not just "slow and steady". The viewer
   should feel the video start and end with intent. Give them bolder,
   more cinematic motion than the filler scenes.
3. If two adjacent scenes share a room type, differentiate the motion so
   they don't feel like one continuous shot. Prefer a perpendicular move
   (e.g. scene 1 pushes in, scene 2 pans across).
4. Honour each scene's planner motionIntent as a hint, not a directive. If
   the planner hinted the same motion for every scene, DEFY the hint to
   preserve variety — your job is the final edit.

## Kling best practices
- ONE sentence, <= 20 words.
- Camera VERB + short qualifier. Nothing else.
- NO room description. NO adjective stacking. NO atmospheric prose.
- Kling animates what it sees. Longer prompts dilute the motion signal.

## Allowed camera verbs
dolly-in, push-in, pan-right, pan-left, tilt-up, tilt-down, pull-back,
orbit, tracking-right, tracking-left, rise, descend, static-drift.

DO NOT USE "crane-reveal" — it produces unpredictable output on this model.

## Pace — default MEDIUM, not slow
Real-estate viewers scroll away from lethargic clips. Keep the camera
moving with intent. Use modifiers like "smooth", "confident", "flowing",
"purposeful", "decisive" — NOT "slow", "gentle", "unhurried", "calm",
"measured". Reserve "slow" for genuine deceleration beats; never lead with it.

## Scene roles (motion character, not just pace)
- opening  — ATTENTION-GRABBING. A decisive push-in, a confident rise,
             or a bold tracking move. The first second has to hook. "Pro" mode.
- hero     — smooth and cinematic, a move that shows off the shot.
- wow      — dynamic and unexpected. An orbit, a tracking arc, a fast
             push-through. "Pro" mode.
- filler   — crisp single move, brisk but not rushed.
- closing  — CONCLUSIVE. A confident pull-back that widens out, or a
             decisive tilt/pan that settles the image. Never static. "Pro" mode.

## Good examples (target length, medium pace)
- "Smooth push-in, confident and flowing."
- "Crisp pan-right across the counter."
- "Purposeful tilt-up to the ceiling line."
- "Decisive pull-back widening the frame."
- "Flowing orbit around the island, cinematic."
- "Confident rise over the bedroom, smooth arc."

## modelParams (required)
- mode: "pro" for opening, hero, wow, closing. "std" for filler only.
- cameraMovement: short slug from the allowed list above ("push-in",
  "pan-right", "pull-back", "orbit", "tilt-up", "tracking-right", etc.).

## Output — CRITICAL
Return ONLY a JSON object, no prose or code fences:
{
  "prompts": [
    {
      "sceneId": "...",
      "prompt": "...",
      "modelChoice": "kling",
      "modelReason": "...",
      "modelParams": { "mode": "std" | "pro", "cameraMovement": "..." }
    }
  ]
}
One entry per scene, preserving sceneId. Every \`modelChoice\` is "kling". Every \`prompt\` is a single sentence of <= 20 words.`;

const SYSTEM_PROMPT_SEEDANCE = `You write motion prompts for ByteDance Seedance 2 image-to-video.

## Storyboard mindset — READ FIRST
You are writing ALL the scenes for ONE short real-estate tour video in a single
pass. Read the "Storyboard" block in the user message first: it lists every
scene in order with role + room type. Write the prompts as a COHERENT
SEQUENCE that guides the viewer through the property.

Continuity rules:
1. VARY camera movements. Consecutive scenes should not use the same verb.
   Rotate through dolly-in, pan-left/right, crane-reveal, push-through,
   orbit, pull-back, tilt-up/down.
2. Opening sets tone (slow, atmospheric). Middle develops. Closing settles
   or pulls back.
3. Adjacent same-room scenes need perpendicular motion so they don't blur
   together.
4. The planner's motionIntent is a hint, not a directive. If it would
   make every scene identical, defy it for variety.

## Seedance best practices
- 1-2 sentences, up to ~45 words.
- Seedance rewards richer context: a camera verb + subject hint + atmosphere.
- You MAY reference light, mood, and a subtle secondary motion (leaves, curtains, reflections).
- Do NOT exhaustively describe the room — the model sees the image. Give it direction, not inventory.
- Avoid vague verbs like "show" or "display".

## Allowed camera verbs
dolly-in, push-in, pan-right, pan-left, tilt-up, tilt-down, pull-back,
orbit, tracking-right, tracking-left, rise, descend, push-through.

DO NOT USE "crane-reveal" — it produces unpredictable output on this model.

## Pace — default MEDIUM, not slow
Real-estate viewers scroll fast. Keep the camera moving with intent. Prefer
modifiers like "smooth", "confident", "flowing", "decisive" over "slow",
"gentle", "unhurried". Use "slow" only for intentional deceleration beats.

## Scene roles (motion character, not just pace)
- opening  — ATTENTION-GRABBING. A decisive push-in or confident rise,
             paired with atmospheric light. The first second has to hook.
- hero     — smooth, immersive, a cinematic move that highlights the subject.
- wow      — dynamic and unexpected. An orbit, a tracking arc, a confident
             push-through with atmospheric detail.
- filler   — crisp single move, brisker than slow.
- closing  — CONCLUSIVE. A confident pull-back widening out, or a decisive
             settle. Never static.

## Good examples (typical length)
- "Slow dolly-in toward the living-room window, warm afternoon light drifting across the frame, steady and cinematic."
- "Crane reveal over the terrace, late-afternoon glow, a subtle breeze moving the curtains."
- "Smooth push-through toward the kitchen island, golden reflections on the stone, unhurried."

## modelParams (required)
- mode: "pro" for hero/wow/opening, "std" otherwise.
- cameraMovement: short slug ("dolly-in", "pan-right", "crane-reveal", "push-through").

## Output — CRITICAL
Return ONLY a JSON object, no prose or code fences:
{
  "prompts": [
    {
      "sceneId": "...",
      "prompt": "...",
      "modelChoice": "seedance" | "seedance-fast",
      "modelReason": "...",
      "modelParams": { "mode": "std" | "pro", "cameraMovement": "..." }
    }
  ]
}
One entry per scene, preserving sceneId.`;

function systemPromptFor(target: "kling" | "seedance" | "seedance-fast"): string {
  return target === "kling" ? SYSTEM_PROMPT_KLING : SYSTEM_PROMPT_SEEDANCE;
}


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

  // Derive a sensible camera movement slug from motionIntent. Note:
  // "crane-reveal" is deliberately NOT in this map — it's banned globally
  // because Kling/Seedance produce unpredictable motion for it. Any intent
  // that mentions crane/aerial gets rewritten to "rise" (vertical ascent),
  // which produces similar-looking output far more reliably.
  const intentLower = motionIntent.toLowerCase();
  let cameraMovement = "push-in";
  if (intentLower.includes("pan left")) cameraMovement = "pan-left";
  else if (intentLower.includes("pan right")) cameraMovement = "pan-right";
  else if (intentLower.includes("zoom out") || intentLower.includes("pull")) cameraMovement = "pull-back";
  else if (intentLower.includes("zoom in") || intentLower.includes("push")) cameraMovement = "push-in";
  else if (intentLower.includes("static")) cameraMovement = "static-drift";
  else if (intentLower.includes("tilt")) cameraMovement = "tilt-up";
  else if (intentLower.includes("orbit")) cameraMovement = "orbit";
  else if (intentLower.includes("crane") || intentLower.includes("aerial")) cameraMovement = "rise";

  // Pace modifier — biased toward MEDIUM/confident rather than slow. The
  // opening/closing get a stronger verb; fillers stay crisp but not rushed.
  const isBookend =
    sceneRole === "opening" || sceneRole === "closing" || sceneRole === "hero" || sceneRole === "wow";
  let moodPrefix: string;
  if (templateMood === "fast_15s") {
    moodPrefix = isBookend ? "Decisive" : "Brisk";
  } else if (templateMood === "investor_20s") {
    moodPrefix = isBookend ? "Confident" : "Crisp";
  } else if (templateMood === "luxury_30s" || templateMood === "premium_45s") {
    moodPrefix = isBookend ? "Cinematic flowing" : "Smooth";
  } else if (templateMood === "family_30s") {
    moodPrefix = isBookend ? "Warm confident" : "Smooth";
  } else {
    moodPrefix = isBookend ? "Confident" : "Smooth";
  }

  const tail = isBookend ? "purposeful and cinematic" : "steady and flowing";
  const prompt = `${moodPrefix} ${cameraMovement.replace("-", " ")} across the ${imageRoomType}, ${tail}.`;

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
// Opening override — replace the first scene's prompt with a random pick
// from the whip-pan opener bank (see ./openers.ts). This is applied AFTER
// the LLM writes its prompts (or the deterministic fallback runs) so we
// always have a strong entrance regardless of what the model produced.
// ---------------------------------------------------------------------------

function applyOpeningOverride(
  prompts: ScenePromptType[],
  scenes: Scene[],
  targetModel: "kling" | "seedance" | "seedance-fast",
): ScenePromptType[] {
  const openingScene =
    scenes.find((s) => s.sceneRole === "opening") ??
    scenes.find((s) => s.order === 0);
  if (!openingScene) return prompts;
  const override = buildOpeningPromptOverride(
    openingScene.sceneId,
    targetModel,
  );
  log("opening.override", {
    sceneId: openingScene.sceneId,
    targetModel,
    cameraMovement: override.modelParams?.cameraMovement,
  });
  return prompts.map((p) =>
    p.sceneId === openingScene.sceneId ? override : p,
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function writeScenePrompts(
  input: WriteScenePromptsInput,
): Promise<WriteScenePromptsResult> {
  const {
    scenes,
    templateName,
    targetModel = "kling",
    model = DEFAULT_MODEL,
  } = input;

  const systemPrompt = systemPromptFor(targetModel);

  const client: Anthropic | { messages: Anthropic["messages"] } =
    input.client ?? new Anthropic();

  // Minimal per-scene context: roomType + role + motion intent + duration.
  // Scores, dominant colors, and the top-labels list have been intentionally
  // removed — the LLM was stacking adjectives from them and producing
  // 150-250-word prompts when Kling/Seedance only reliably act on the first
  // clause. The reference image itself (attached below) is the primary
  // grounding signal.
  const sceneBriefs = scenes.map((s) => ({
    sceneId: s.sceneId,
    roomType: s.imageRoomType,
    sceneRole: s.sceneRole,
    motionIntent: s.motionIntent,
    durationSec: s.durationSec,
    overlayText: s.overlayText,
  }));

  // Storyboard summary — a compact list of every scene in order, given to
  // the LLM BEFORE any individual brief or image so it can plan the camera-
  // movement variety across the sequence (not just react to each scene in
  // isolation). This is the single biggest lever we have for cohesion:
  // without it, the LLM produces "5 independent sentences" because each
  // scene brief looks the same to it locally. With it, Claude can see that
  // scenes 1-2 are both living rooms and needs to differentiate, or that
  // every planner motionIntent says "ken-burns upward reveal" and it
  // should vary verbs anyway.
  const storyboardLines = scenes.map((s) => {
    const parts = [
      `Scene ${s.order + 1}/${scenes.length}`,
      s.sceneRole,
      s.imageRoomType,
      `${s.durationSec}s`,
      `intent=${s.motionIntent || "none"}`,
    ];
    return `  ${parts.join(" · ")}`;
  });
  const storyboardBlock =
    `Storyboard (full sequence — read this FIRST before writing any prompt):\n` +
    storyboardLines.join("\n") +
    `\n\n` +
    `Write varied camera movements. Consecutive scenes and same-room scenes ` +
    `must use different verbs. Treat this as a single cohesive tour, not ` +
    `${scenes.length} independent prompts.`;

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        `Template name: ${templateName}\n\n` +
        storyboardBlock +
        `\n\n` +
        "Below: each scene's individual brief + reference image, in order. " +
        "Plan camera-verb variety first using the Storyboard above, THEN write each prompt.",
    },
  ];

  for (const scene of scenes) {
    const brief = sceneBriefs.find((item) => item.sceneId === scene.sceneId);
    userContent.push({
      type: "text",
      text:
        `Scene ${scene.order + 1}/${scenes.length} (${scene.sceneRole})\n` +
        JSON.stringify(brief, null, 2),
    });
    try {
      userContent.push(await buildAnthropicImageContent(scene.imagePath));
    } catch (error) {
      userContent.push({
        type: "text",
        text:
          `Reference image unavailable for scene ${scene.sceneId}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  log("call.start", {
    model,
    targetModel,
    templateName,
    sceneCount: scenes.length,
  });

  // Helper to call the API with an optional retry message appended
  async function callAnthropic(
    extraMessages: Array<{
      role: "user" | "assistant";
      content: string | Array<Record<string, unknown>>;
    }> = [],
  ): Promise<Anthropic.Message> {
    const messages = [
      { role: "user", content: userContent as any },
      ...extraMessages,
    ] as any;

    // Prompt caching: `cache_control` is not in this SDK version's TextBlockParam
    // type, but the API accepts it at runtime regardless of beta header. The
    // args object is built untyped and passed as `any` to bypass the strict
    // excess-property check at the call site only.
    const params = {
      model,
      max_tokens: 4096,
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
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
      const prompts = applyOpeningOverride(
        alignPrompts(validation.data.prompts, scenes),
        scenes,
        targetModel,
      );
      log("call.success", {
        model,
        sceneCount: scenes.length,
        ...usageMeta,
      });
      return {
        prompts,
        anthropicRequestId,
        ...usageMeta,
        costUsd: anthropicCost({
          model,
          inputTokens: usageMeta.tokensIn,
          outputTokens: usageMeta.tokensOut,
          cacheReadTokens: usageMeta.cacheReadTokens,
          cacheWriteTokens: usageMeta.cacheWriteTokens,
        }),
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
        const prompts = applyOpeningOverride(
          alignPrompts(retryValidation.data.prompts, scenes),
          scenes,
          targetModel,
        );
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
          costUsd: anthropicCost({
            model,
            inputTokens: usageMeta.tokensIn,
            outputTokens: usageMeta.tokensOut,
            cacheReadTokens: usageMeta.cacheReadTokens,
            cacheWriteTokens: usageMeta.cacheWriteTokens,
          }),
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
  const prompts = applyOpeningOverride(
    scenes.map(fallbackPromptFor),
    scenes,
    targetModel,
  );
  return {
    prompts,
    anthropicRequestId,
    ...usageMeta,
    costUsd: anthropicCost({
      model,
      inputTokens: usageMeta.tokensIn,
      outputTokens: usageMeta.tokensOut,
      cacheReadTokens: usageMeta.cacheReadTokens,
      cacheWriteTokens: usageMeta.cacheWriteTokens,
    }),
    fallbackUsed: true,
  };
}
