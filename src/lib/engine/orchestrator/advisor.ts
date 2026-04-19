/**
 * Advisor-mode wiring for the orchestrator.
 *
 * "Advisor mode" is an Anthropic beta feature (`advisor-tool-2026-03-01`) that
 * pairs a faster executor model (Sonnet) with a higher-intelligence advisor
 * model (Opus) as a server-side tool. The executor calls `advisor()` with no
 * arguments; the server runs a separate Opus inference over the full transcript
 * and returns advice as an `advisor_tool_result` block the executor can read.
 *
 * Docs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool
 *
 * This module centralises the constants + the augmented system prompt prefix
 * so orchestrator.ts stays readable.
 */

export const ADVISOR_BETA_HEADER = "advisor-tool-2026-03-01";

export const DEFAULT_ADVISOR_EXECUTOR = "claude-sonnet-4-6";
export const DEFAULT_ADVISOR_MODEL = "claude-opus-4-6";

/**
 * Advisor server tool definition. Shape is `{ type, name, model }` — no
 * `input_schema`. The local @anthropic-ai/sdk types do not know about
 * `advisor_20260301` yet, so callers cast to `any` when pushing this into the
 * `tools` array.
 */
export interface AdvisorToolDef {
  type: "advisor_20260301";
  name: "advisor";
  model: string;
  max_uses?: number;
}

export function advisorTool(model: string = DEFAULT_ADVISOR_MODEL): AdvisorToolDef {
  return {
    type: "advisor_20260301",
    name: "advisor",
    model,
  };
}

/**
 * Anthropic-recommended timing + treatment guidance, trimmed for our pipeline.
 * Prepended to SYSTEM_PROMPT when advisor mode is on. Kept short — advisor
 * tokens are billed separately and this text gets forwarded on every turn.
 */
export const ADVISOR_SYSTEM_PREFIX = `You have access to an \`advisor\` tool backed by a stronger reviewer model. It takes NO parameters — calling advisor() forwards the full conversation automatically.

Call advisor BEFORE substantive work — before calling build_timeline on a borderline dataset, before render_video if the timeline has warnings, or before declaring failure. Orientation (analyze_images) is not substantive work; calling the tools is. Also call advisor when stuck or when output doesn't match expectations.

The advisor should respond in under 100 words and use enumerated steps, not explanations.

Give the advice serious weight. If a suggested step fails empirically or contradicts primary evidence (a tool result says X), adapt. If you've already retrieved data that conflicts with the advice, surface the conflict in one more advisor call rather than silently switching.

`;
