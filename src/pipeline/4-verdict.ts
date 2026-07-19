/**
 * Step 4 — Verdict.
 *
 * The Grounding agent renders a final recommendation per theme, given its
 * grounding status and its score breakdown (volume, severity, authority,
 * revenue-at-risk). It returns a verdict, a one-line rationale, and a
 * confidence level. The self-check (step 5) then downgrades low-confidence
 * verdicts to needs_more_info so we never over-claim.
 */

import type { Theme, Verdict } from "../types.js";
import { completeJSON } from "../llm.js";

interface VerdictResult {
  theme_id: string;
  verdict: Verdict;
  rationale: string;
  confidence: number; // 0..1
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["theme_id", "verdict", "rationale", "confidence"],
        properties: {
          theme_id: { type: "string" },
          verdict: {
            type: "string",
            enum: ["pursue", "already_planned", "park", "decline", "needs_more_info"],
          },
          rationale: { type: "string", description: "one line justifying the verdict" },
          confidence: {
            type: "number",
            description: "0..1 — how sure you are given the evidence",
          },
        },
      },
    },
  },
};

const SYSTEM = `You are the decision agent for TaskFlow (a project-management SaaS) product prioritization. For each theme you get its
grounding status, its priority score, and a breakdown (volume, severity, source authority, and
revenue-at-risk in dollars). Render one verdict:
- "pursue": in-scope, high-impact, worth building this quarter. Reserve this for themes that clear the bar.
- "already_planned": valuable but already on the roadmap — acknowledge, don't re-scope.
- "park": real but lower priority given revenue/authority; revisit later.
- "decline": out of scope or conflicts with a constraint.
- "needs_more_info": evidence is too thin to decide confidently.
Weigh revenue-at-risk and source authority heavily: a theme concentrated in high-revenue enterprise
accounts and raised by sales beats a high-volume theme from anonymous reviews. Give an honest confidence
(0..1). If the signal is thin or contradictory, lower the confidence rather than guessing.`;

export async function decideVerdicts(themes: Theme[]): Promise<Theme[]> {
  const themeList = themes
    .map((t) => {
      const s = t.score;
      return [
        `theme_id: ${t.theme_id}`,
        `  title: ${t.title}`,
        `  grounding: ${t.grounding?.status} (${t.grounding?.evidence})`,
        `  volume: ${s?.volume} signals`,
        `  severity_norm: ${s?.severity_norm}`,
        `  authority_weight: ${s?.authority_weight}`,
        `  revenue_at_risk: $${s?.revenue_at_risk?.toLocaleString()}`,
        `  priority_score: ${s?.total}`,
      ].join("\n");
    })
    .join("\n\n");

  const prompt = `Render a verdict for each theme.\n\n${themeList}`;

  const { data } = await completeJSON<{ verdicts: VerdictResult[] }>({
    system: SYSTEM,
    prompt,
    schema: SCHEMA,
    maxTokens: 8000,
    effort: "high",
    label: "verdict",
  });

  const byId = new Map(data.verdicts.map((v) => [v.theme_id, v]));
  return themes.map((t) => {
    const v = byId.get(t.theme_id);
    return v
      ? { ...t, verdict: v.verdict, rationale: v.rationale, confidence: v.confidence }
      : {
          ...t,
          verdict: "needs_more_info" as Verdict,
          rationale: "no verdict returned",
          confidence: 0,
        };
  });
}
