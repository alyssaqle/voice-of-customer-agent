/**
 * Step 2 — Grounding.
 *
 * The Grounding agent checks each theme against product_context.md (current
 * constraints + roadmap) so the pipeline doesn't propose things we've already
 * shipped or that are explicitly out of scope. It tags each theme with a
 * grounding status and the evidence (which line of context it relied on).
 */

import type { GroundingStatus, Theme } from "../types.js";
import { completeJSON } from "../llm.js";

interface GroundingResult {
  theme_id: string;
  status: GroundingStatus;
  evidence: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["groundings"],
  properties: {
    groundings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["theme_id", "status", "evidence"],
        properties: {
          theme_id: { type: "string" },
          status: {
            type: "string",
            enum: ["novel", "already_shipped", "out_of_scope", "on_roadmap"],
          },
          evidence: {
            type: "string",
            description: "the specific constraint/roadmap line that justifies the status",
          },
        },
      },
    },
  },
};

const SYSTEM = `You are a grounding agent for TaskFlow, a project-management SaaS. You compare candidate themes against the
product context (what we've shipped, what's on the roadmap, and what's out of scope) and classify each:
- "already_shipped": the capability already exists in the product.
- "on_roadmap": already planned/committed — don't treat it as a new idea.
- "out_of_scope": conflicts with a stated strategic or technical constraint.
- "novel": a genuine, in-scope opportunity not covered above.
Base every classification on a specific line from the product context, and quote it in "evidence".
When a theme is a known-issue of a shipped feature, classify it "already_shipped" and note the known issue.`;

export async function groundThemes(
  themes: Theme[],
  productContext: string,
): Promise<Theme[]> {
  const themeList = themes
    .map((t) => `${t.theme_id}: ${t.title} — ${t.summary}`)
    .join("\n");

  const prompt = `PRODUCT CONTEXT:\n${productContext}\n\nTHEMES TO CLASSIFY:\n${themeList}`;

  const { data } = await completeJSON<{ groundings: GroundingResult[] }>({
    system: SYSTEM,
    prompt,
    schema: SCHEMA,
    maxTokens: 8000,
    effort: "high",
    label: "ground",
  });

  const byId = new Map(data.groundings.map((g) => [g.theme_id, g]));
  return themes.map((t) => {
    const g = byId.get(t.theme_id);
    return {
      ...t,
      grounding: g
        ? { status: g.status, evidence: g.evidence }
        : { status: "novel", evidence: "no grounding returned; defaulted to novel" },
    };
  });
}
