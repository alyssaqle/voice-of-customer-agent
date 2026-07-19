/**
 * Thin wrapper around the Anthropic SDK used by every pipeline step.
 *
 * Responsibilities:
 *  - read ANTHROPIC_API_KEY from .env (never hardcoded)
 *  - force structured JSON output via output_config.format (json_schema), so
 *    each step gets schema-valid data instead of hand-parsing prose
 *  - retry gracefully on rate limits / transient 5xx (on top of the SDK's own
 *    retries) and surface refusals explicitly
 *  - return the raw request/response so the orchestrator can log it for audit
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { MODEL, LLM_RETRY } from "../config.js";

// The SDK reads ANTHROPIC_API_KEY from the environment automatically. We also
// retry 429/5xx/network errors (maxRetries), so the pipeline is re-runnable.
const client = new Anthropic({ maxRetries: LLM_RETRY.maxRetries });

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface JsonCallOptions {
  system: string;
  prompt: string;
  /** JSON Schema the response must satisfy (additionalProperties:false + required). */
  schema: Record<string, unknown>;
  maxTokens?: number;
  /** Reasoning effort: low | medium | high | xhigh | max. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Label used in audit logs. */
  label: string;
}

export interface JsonCallResult<T> {
  data: T;
  raw: unknown; // the full SDK response, for the audit log
  usage: unknown;
}

/**
 * Make one structured-output call and return validated JSON.
 * Throws after exhausting retries so the orchestrator can decide what to do.
 */
export async function completeJSON<T>(
  opts: JsonCallOptions,
): Promise<JsonCallResult<T>> {
  const { system, prompt, schema, label } = opts;
  const maxTokens = opts.maxTokens ?? 16000;
  const effort = opts.effort ?? "high";

  let lastErr: unknown;
  for (let attempt = 0; attempt <= LLM_RETRY.maxRetries; attempt++) {
    try {
      // Stream so large outputs (e.g. clustering 300 signals) don't hit HTTP
      // timeouts and thinking tokens don't silently truncate the JSON. We only
      // need the final message, so use the SDK's finalMessage() helper.
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        output_config: {
          effort,
          format: { type: "json_schema", schema } as never,
        } as never,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      const response = await stream.finalMessage();

      // A safety refusal returns 200 with stop_reason "refusal" and no usable
      // content — treat it as a hard error rather than crashing on content[0].
      if (response.stop_reason === "refusal") {
        throw new Error(`[${label}] model refused the request`);
      }
      // Truncated output → the JSON is incomplete. Retrying at the same budget
      // won't help, so fail loudly with an actionable message.
      if (response.stop_reason === "max_tokens") {
        throw new Error(
          `[${label}] hit max_tokens (${maxTokens}); raise maxTokens for this step`,
        );
      }

      const textBlock = response.content.find((b) => b.type === "text");
      const text = textBlock && "text" in textBlock ? textBlock.text : "";
      if (!text) throw new Error(`[${label}] empty response`);

      const data = parseJson<T>(text, label);
      return { data, raw: response, usage: response.usage };
    } catch (err) {
      lastErr = err;
      // The SDK already retries 429/5xx internally; this outer loop also covers
      // JSON parse failures and refusal blips. Back off exponentially.
      const retriable =
        err instanceof Anthropic.RateLimitError ||
        err instanceof Anthropic.APIConnectionError ||
        (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) ||
        err instanceof SyntaxError ||
        (err instanceof Error && err.message.includes("empty response"));

      if (!retriable || attempt === LLM_RETRY.maxRetries) break;

      const delay = Math.min(
        LLM_RETRY.baseDelayMs * 2 ** attempt,
        LLM_RETRY.maxDelayMs,
      );
      console.warn(
        `  ↻ [${label}] attempt ${attempt + 1} failed (${errMessage(err)}); retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** Robust JSON extraction — tolerates stray code fences if the model adds them. */
function parseJson<T>(text: string, label: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Fall back to the first {...} or [...] span.
    const match = trimmed.match(/[[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]) as T;
    throw new SyntaxError(`[${label}] could not parse JSON from response`);
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.status} ${err.name}`;
  return err instanceof Error ? err.message : String(err);
}
