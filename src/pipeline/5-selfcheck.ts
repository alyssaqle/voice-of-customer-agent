/**
 * Step 5 — Self-check.
 *
 * Pure guardrail, no LLM. Any theme whose verdict confidence is below the
 * threshold in config.ts is flagged and downgraded to `needs_more_info` rather
 * than presented as a confident recommendation. This is the "don't over-claim"
 * rule: the tool would rather say "I'm not sure" than assert a shaky verdict.
 */

import type { Theme } from "../types.js";
import { CONFIDENCE_THRESHOLD } from "../../config.js";

export function selfCheck(themes: Theme[]): Theme[] {
  return themes.map((t) => {
    const confident = (t.confidence ?? 0) >= CONFIDENCE_THRESHOLD;
    if (confident) return { ...t, flagged: false };

    return {
      ...t,
      flagged: true,
      // Preserve the original rationale but make the downgrade explicit.
      verdict: "needs_more_info",
      rationale: `Confidence ${(t.confidence ?? 0).toFixed(2)} < ${CONFIDENCE_THRESHOLD} — flagged for review. (was: ${t.rationale ?? "n/a"})`,
    };
  });
}
