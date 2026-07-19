// Central, tunable configuration. An interviewer should be able to read this
// file and understand every knob that affects prioritization. Nothing here is
// hardcoded downstream — the pipeline and scorer import these values.

import type { Source } from "./src/types.js";

/** LLM model used by every pipeline step. Override with MODEL in .env. */
export const MODEL = process.env.MODEL ?? "claude-opus-4-8";

/**
 * Source authority weights (0..1). The core thesis of the tool: not all
 * feedback is equal. A paying customer's support ticket or an AE's sales-call
 * note is a stronger buy-signal than an anonymous app-store review.
 * Tune these freely — they flow directly into the priority score.
 */
export const SOURCE_AUTHORITY: Record<Source, number> = {
  sales_call: 1.0, // AE relaying a deal-blocking issue, revenue attached
  support_ticket: 0.85, // known paying customer, reproducible problem
  survey: 0.6, // identified respondent, but lower intent
  slack: 0.55, // internal channel signal; quality varies
  app_review: 0.35, // often anonymous, noisy, low context
};

/**
 * Priority score weights. priority = Σ (weight · normalized_component).
 * Components are each normalized to ~0..1 so weights are comparable.
 * These four should sum to 1.0 for interpretability (not enforced).
 */
export const SCORE_WEIGHTS = {
  volume: 0.2, // how many signals map to the theme (log-scaled)
  severity: 0.25, // how bad it is (from theme extraction)
  authority: 0.2, // mean source authority of the theme's signals
  revenue: 0.35, // revenue at risk — the money the theme touches
};

/**
 * A theme counts toward "revenue-at-risk surfaced" (the headline number) only
 * when its final verdict is `pursue`. Kept as a constant so the rule is explicit.
 */
export const HIGH_PRIORITY_VERDICTS = ["pursue"] as const;

/**
 * Self-check threshold. Any theme the verdict step returns with confidence
 * below this is downgraded to `needs_more_info` rather than over-claiming.
 */
export const CONFIDENCE_THRESHOLD = 0.6;

/** Retry/backoff for the Anthropic client. */
export const LLM_RETRY = {
  maxRetries: 5,
  baseDelayMs: 1000, // exponential: base * 2^attempt
  maxDelayMs: 30000,
};
