/**
 * Step 1 — Theme extraction.
 *
 * The Clustering agent reads all raw signals and groups them into a small set
 * of themes. Each theme carries the signal_ids that map to it, an aggregated
 * severity (1-5), and overall sentiment. This is the one step that sees every
 * signal at once; later steps operate per-theme.
 */

import type { Signal, Sentiment, Theme } from "../types.js";
import { completeJSON } from "../llm.js";

/** What the LLM returns for step 1 (before scoring/grounding/verdict). */
interface ExtractedTheme {
  theme_id: string;
  title: string;
  summary: string;
  signal_ids: string[];
  severity: number; // 1..5
  sentiment: Sentiment;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["themes"],
  properties: {
    themes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["theme_id", "title", "summary", "signal_ids", "severity", "sentiment"],
        properties: {
          theme_id: { type: "string", description: "short kebab-case id, e.g. checkout-crash" },
          title: { type: "string" },
          summary: { type: "string", description: "one sentence describing the theme" },
          signal_ids: {
            type: "array",
            items: { type: "string" },
            description: "ids of the raw signals that belong to this theme",
          },
          severity: {
            type: "integer",
            enum: [1, 2, 3, 4, 5],
            description: "5 = broken/blocking, 1 = minor nice-to-have",
          },
          sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
        },
      },
    },
  },
};

const SYSTEM = `You are a product-analytics agent for TaskFlow, a project-management SaaS (the same
category as Asana and Monday). You cluster raw customer feedback into a small set of distinct, actionable themes.
Rules:
- Produce between 8 and 15 themes. Merge near-duplicates; do not create one theme per signal.
- Every signal_id you cite MUST come from the provided list. Do not invent ids.
- Assign each signal to the single best-fitting theme.
- severity reflects customer impact: 5 = broken/blocking a core flow, 3 = painful friction, 1 = minor request.
- sentiment is the overall tone of the signals in the theme.`;

export async function extractThemes(signals: Signal[]): Promise<Theme[]> {
  // Give the model id + source + text. Source matters: it hints at authority
  // and helps clustering (a sales-call note reads differently from a review).
  const lines = signals
    .map((s) => `${s.id} [${s.source}] ${s.text}`)
    .join("\n");

  const prompt = `Cluster the following ${signals.length} feedback signals into themes.\n\nSIGNALS:\n${lines}`;

  const { data } = await completeJSON<{ themes: ExtractedTheme[] }>({
    system: SYSTEM,
    prompt,
    schema: SCHEMA,
    // The heavy step: emitting signal_ids for ~300 signals. Give it a large
    // budget (streamed) and lighter effort — clustering doesn't need deep
    // reasoning, and this keeps thinking tokens from crowding out the JSON.
    maxTokens: 32000,
    effort: "medium",
    label: "extract",
  });

  // Reconcile against the real signal set: drop any hallucinated ids and
  // de-duplicate, so downstream scoring counts only genuine signals.
  const valid = new Set(signals.map((s) => s.id));
  const themes: Theme[] = data.themes.map((t) => ({
    theme_id: t.theme_id,
    title: t.title,
    summary: t.summary,
    signal_ids: [...new Set(t.signal_ids)].filter((id) => valid.has(id)),
    severity: t.severity,
    sentiment: t.sentiment,
  }));

  return themes.filter((t) => t.signal_ids.length > 0);
}
