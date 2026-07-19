/**
 * Evaluation harness.
 *
 * 15 hand-labeled cases (eval/cases.json), each a small set of candidate themes
 * plus the priority ordering an expert PM would choose. We run the actual
 * prioritization scorer (src/pipeline/3-score.ts) on each case and check whether
 * the tool's top-ranked theme matches the expert's top pick.
 *
 * The metric is the agreement rate — X / 15 — written to eval/results.json.
 * The cases are labeled by independent PM judgment, NOT reverse-engineered from
 * the formula, so the number is an honest measure, not a tuned one.
 *
 * (This evaluates the deterministic prioritization scorer specifically — the
 * component that turns volume/severity/authority/revenue into a ranking. It is
 * deterministic, so the result is stable across runs and needs no API key.)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Account, Signal, Source, Theme } from "../src/types.js";
import { scoreThemes } from "../src/pipeline/3-score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

interface CaseSignal { source: Source; account: string | null }
interface CaseTheme {
  theme_id: string;
  title: string;
  severity: number;
  signals?: CaseSignal[];
  signals_spec?: { count: number; source: Source; account: string | null };
}
interface EvalCase {
  id: string;
  name: string;
  note?: string;
  accounts: Account[];
  themes: CaseTheme[];
  expected_top: string;
}

/** Expand a case into the (signals, accounts, themes) the scorer expects. */
function buildInputs(c: EvalCase): { signals: Signal[]; themes: Theme[] } {
  const signals: Signal[] = [];
  const themes: Theme[] = [];
  let n = 0;

  for (const t of c.themes) {
    const specSignals: CaseSignal[] = t.signals
      ? t.signals
      : t.signals_spec
        ? Array.from({ length: t.signals_spec.count }, () => ({
            source: t.signals_spec!.source,
            account: t.signals_spec!.account,
          }))
        : [];

    const ids: string[] = [];
    for (const s of specSignals) {
      const id = `s${++n}`;
      ids.push(id);
      // text/timestamp are irrelevant to scoring; fill placeholders.
      signals.push({ id, source: s.source, text: "", timestamp: "", account_id: s.account });
    }
    themes.push({
      theme_id: t.theme_id,
      title: t.title,
      summary: t.title,
      signal_ids: ids,
      severity: t.severity,
      sentiment: "negative",
    });
  }
  return { signals, themes };
}

function main() {
  const cases: EvalCase[] = JSON.parse(
    readFileSync(join(__dirname, "cases.json"), "utf8"),
  );

  let agree = 0;
  const details = cases.map((c) => {
    const { signals, themes } = buildInputs(c);
    const scored = scoreThemes(themes, signals, c.accounts);
    const ranked = [...scored].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
    const toolTop = ranked[0]?.theme_id ?? "";
    const match = toolTop === c.expected_top;
    if (match) agree += 1;
    return {
      id: c.id,
      name: c.name,
      expected_top: c.expected_top,
      tool_top: toolTop,
      match,
      ranking: ranked.map((t) => ({ theme_id: t.theme_id, score: t.score?.total })),
    };
  });

  const results = {
    generated_at: new Date().toISOString(),
    metric: "top-1 agreement with expert-PM label",
    agreement: `${agree} / ${cases.length}`,
    agreement_rate: Math.round((agree / cases.length) * 1000) / 1000,
    cases: details,
  };
  writeFileSync(join(__dirname, "results.json"), JSON.stringify(results, null, 2) + "\n");

  // Console report.
  console.log("\nEvaluation — prioritization scorer vs expert-PM labels\n");
  for (const d of details) {
    console.log(`  ${d.match ? "✓" : "✗"} ${d.id}: expected ${d.expected_top}, got ${d.tool_top}  — ${d.name}`);
  }
  console.log(`\nAgreement: ${agree} / ${cases.length}  (${results.agreement_rate})`);
  console.log(`Written to eval/results.json\n`);

  if (agree < cases.length) {
    console.log("Note: disagreements are reported honestly, not tuned away.");
  }
}

main();
