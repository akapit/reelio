/**
 * Shared LLM client for the kie.ai-hosted "codex" Responses API proxy.
 *
 * This module is the single chokepoint for every call to
 * `POST https://api.kie.ai/codex/v1/responses` across the app. Callers
 * (currently: `src/lib/media/prompts/seedance.ts`,
 * `src/app/api/generate-script/route.ts`, and
 * `src/app/api/generate-video-prompt/route.ts`) go through `callCodex`
 * instead of reaching `fetch` directly.
 *
 * The wrapper is intentionally provider-agnostic at the call sites — we
 * still point at kie.ai under the hood today (env var `KIEAI_CODEX_KEY`),
 * but callers no longer encode that fact. Swapping to OpenAI or piapi
 * later is a one-file change here.
 *
 * Stays pure — no Next.js or `@trigger.dev/sdk` imports — so it works
 * from route handlers AND from Trigger.dev tasks (via seedance.ts).
 */

const CODEX_BASE_URL = "https://api.kie.ai";
const CODEX_PATH = "/codex/v1/responses";
const DEFAULT_MODEL = "gpt-5-4";

export interface CodexCallOptions {
  /**
   * The user content / prompt. If `system` is provided, the two are joined
   * with a double newline into the single `input` string the upstream
   * Responses proxy expects (matching the pre-refactor pattern shared by
   * all three callers).
   */
  prompt: string;
  /** Optional system preamble joined in front of `prompt`. */
  system?: string;
  /** Overrides the default `"gpt-5-4"`. */
  model?: string;
  /** Forwarded verbatim as the `temperature` field when provided. */
  temperature?: number;
  /** Forwarded verbatim as `max_output_tokens` when provided. */
  maxTokens?: number;
  /**
   * Internal abort timeout in ms. Aborts the underlying fetch and throws
   * an Error whose message is `"codex timeout"`. No default — omit for no
   * internal timeout.
   */
  timeoutMs?: number;
  /**
   * External AbortSignal. Combined with the internal timeout signal so
   * either aborting cancels the request.
   */
  signal?: AbortSignal;
}

export interface CodexCallResult {
  /** Extracted text from the Responses output (union-normalized). */
  text: string;
  /** `x-request-id` response header if the upstream returned one. */
  requestId?: string;
  /** Wall-clock time from request-start to response parsed. */
  durationMs: number;
  /** Model slug actually sent. */
  model: string;
}

/**
 * Structured logger for codex calls. Mirrors the `logKie` pattern in
 * `src/lib/media/providers/kieai.ts` so Trigger.dev console ingestion can
 * filter on `source: "codex"`. Intentionally NOT imported from kieai.ts —
 * this module must stay independent so a provider swap doesn't force a
 * log-format change here.
 */
function logCodex(event: string, data: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ source: "codex", event, ...data }));
  } catch {
    console.log(`[codex] ${event}`);
  }
}

function logCodexError(event: string, data: Record<string, unknown>): void {
  try {
    console.error(
      JSON.stringify({ source: "codex", event, level: "error", ...data }),
    );
  } catch {
    console.error(`[codex] ${event} (error)`);
  }
}

/**
 * Minimal shape of the kie.ai Responses API output the three legacy
 * callers all walked. Kept loose on purpose — we only ever traverse this.
 */
interface ResponsesOutputItem {
  type?: string;
  content?: Array<{ type?: string; text?: string }> | string;
  text?: string;
}
interface ResponsesApiBody {
  output?: ResponsesOutputItem[];
  /** Some models/proxies return a flat `output_text` string. */
  output_text?: string;
  /** Even flatter shape used as a last-resort fallback. */
  text?: string;
}

/**
 * Extract the first non-empty text string from a Responses API payload.
 * Union of how all three pre-refactor callers parsed the response:
 *   1. Walk `data.output[*].content[*]` for `type === "output_text"`.
 *   2. Fall back to top-level `data.output_text`.
 *   3. Fall back to top-level `data.text`.
 */
function extractResponseText(data: ResponsesApiBody): string | null {
  const seen = new Set<unknown>();
  const findText = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = findText(item);
        if (hit) return hit;
      }
      return null;
    }

    const record = value as Record<string, unknown>;
    for (const key of ["output_text", "text", "content"]) {
      const hit = findText(record[key]);
      if (hit) return hit;
    }
    return null;
  };

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item?.type && !["message", "output_text"].includes(item.type)) {
        continue;
      }
      const hit = findText(item);
      if (hit) return hit;
    }
  }
  return findText(data);
}

/**
 * Combine two abort signals so that aborting EITHER aborts the returned
 * controller. Returned `cleanup` removes the listeners so short-lived
 * external signals don't leak.
 */
function linkSignals(
  internal: AbortController,
  external: AbortSignal | undefined,
): () => void {
  if (!external) return () => {};
  if (external.aborted) {
    internal.abort(external.reason);
    return () => {};
  }
  const onAbort = () => internal.abort(external.reason);
  external.addEventListener("abort", onAbort, { once: true });
  return () => external.removeEventListener("abort", onAbort);
}

/**
 * Single entry point for the kie.ai codex Responses proxy. Throws on:
 *   - HTTP non-2xx (message includes status + body),
 *   - internal timeout (message: `"codex timeout"`),
 *   - missing text in the response body (message: `"codex: no text in response"`).
 *
 * Network-level failures (thrown by `fetch`) propagate as-is.
 */
export async function callCodex(
  options: CodexCallOptions,
): Promise<CodexCallResult> {
  const {
    prompt,
    system,
    model = DEFAULT_MODEL,
    temperature,
    maxTokens,
    timeoutMs,
    signal,
  } = options;

  const apiKey = process.env.KIEAI_CODEX_KEY;
  if (!apiKey) {
    logCodexError("missingApiKey", { model });
    throw new Error("codex: KIEAI_CODEX_KEY is not set");
  }

  // Matches the pre-refactor pattern shared by all three callers: the
  // upstream proxy wants ONE `input` string, and they all concatenated
  // system + "\n\n" + prompt when a system was present.
  const input = system ? `${system}\n\n${prompt}` : prompt;

  const body: Record<string, unknown> = {
    model,
    stream: false,
    input,
    reasoning: { effort: "low" },
  };
  if (typeof temperature === "number") body.temperature = temperature;
  if (typeof maxTokens === "number") body.max_output_tokens = maxTokens;

  const controller = new AbortController();
  const unlink = linkSignals(controller, signal);
  const timeoutHandle =
    typeof timeoutMs === "number"
      ? setTimeout(() => {
          controller.abort(new Error("codex timeout"));
        }, timeoutMs)
      : null;

  logCodex("request", {
    model,
    promptLength: prompt.length,
    hasSystem: Boolean(system),
    timeoutMs: timeoutMs ?? null,
  });

  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(`${CODEX_BASE_URL}${CODEX_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    // Distinguish internal timeout from other aborts / network failures.
    const isTimeout =
      timeoutHandle !== null &&
      controller.signal.aborted &&
      // External-signal aborts also set signal.aborted; only call it a
      // timeout if the external signal wasn't the cause.
      !(signal?.aborted ?? false);
    if (isTimeout) {
      logCodexError("timeout", { model, durationMs, timeoutMs });
      throw new Error("codex timeout");
    }
    logCodexError("networkError", {
      model,
      durationMs,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    unlink();
  }

  const durationMs = Date.now() - start;
  const requestId = res.headers.get("x-request-id") ?? undefined;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logCodexError("httpError", {
      model,
      status: res.status,
      durationMs,
      requestId,
      body: text,
    });
    throw new Error(`codex ${res.status}: ${text}`);
  }

  let data: ResponsesApiBody;
  try {
    data = (await res.json()) as ResponsesApiBody;
  } catch (err) {
    logCodexError("invalidJson", {
      model,
      durationMs,
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error("codex: invalid JSON response");
  }

  const text = extractResponseText(data);
  if (!text) {
    logCodexError("noText", { model, durationMs, requestId });
    throw new Error("codex: no text in response");
  }

  logCodex("response", {
    model,
    durationMs,
    requestId,
    textLength: text.length,
  });

  return { text, requestId, durationMs, model };
}
