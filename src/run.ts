/**
 * Pipeline orchestrator.
 *
 * Runs the five steps in order, logging each step's input and output to
 * runs/<timestamp>/ for a fully auditable trace, then writes results.json with
 * the ranked themes and the headline number: total revenue-at-risk surfaced
 * (the sum of revenue-at-risk across themes we recommend pursuing).
 *
 * Re-runnable: each run gets its own timestamped folder; the LLM client retries
 * on transient errors. Fails fast with a clear message if the API key is missing.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Account, Signal, Theme } from "./types.js";
import { MODEL, HIGH_PRIORITY_VERDICTS, CONFIDENCE_THRESHOLD } from "../config.js";
import { hasApiKey } from "./llm.js";
import { extractThemes } from "./pipeline/1-extract.js";
import { groundThemes } from "./pipeline/2-ground.js";
import { scoreThemes } from "./pipeline/3-score.js";
import { decideVerdicts } from "./pipeline/4-verdict.js";
import { selfCheck } from "./pipeline/5-selfcheck.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8")) as T;
}

async function main() {
  if (!hasApiKey()) {
    console.error(
      "ERROR: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.",
    );
    process.exit(1);
  }

  const signals = loadJson<Signal[]>("data/signals.json");
  const accounts = loadJson<Account[]>("data/accounts.json");
  const productContext = readFileSync(join(ROOT, "product_context.md"), "utf8");

  // Timestamped audit directory (filesystem-safe ISO).
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(ROOT, "runs", ts);
  mkdirSync(runDir, { recursive: true });

  let stepNo = 0;
  const logStep = (name: string, input: unknown, output: unknown) => {
    stepNo += 1;
    const file = join(runDir, `${String(stepNo).padStart(2, "0")}-${name}.json`);
    writeFileSync(file, JSON.stringify({ step: name, input, output }, null, 2) + "\n");
    console.log(`  ✓ step ${stepNo} (${name}) → ${file.replace(ROOT + "/", "")}`);
  };

  console.log(`\nVoice-of-Customer pipeline — model: ${MODEL}`);
  console.log(`Input: ${signals.length} signals across ${accounts.length} accounts`);
  console.log(`Run dir: runs/${ts}\n`);

  // ---- Step 1: theme extraction ----
  console.log("Step 1: extracting themes…");
  let themes: Theme[] = await extractThemes(signals);
  logStep("extract", { signal_count: signals.length }, themes);
  console.log(`    → ${themes.length} themes\n`);

  // ---- Step 2: grounding ----
  console.log("Step 2: grounding against product_context.md…");
  themes = await groundThemes(themes, productContext);
  logStep("ground", { themes: themes.map((t) => t.theme_id) }, themes.map((t) => ({ theme_id: t.theme_id, grounding: t.grounding })));
  console.log("");

  // ---- Step 3: scoring (pure) ----
  console.log("Step 3: scoring (volume · severity · authority · revenue)…");
  themes = scoreThemes(themes, signals, accounts);
  logStep("score", { weights: "see config.ts" }, themes.map((t) => ({ theme_id: t.theme_id, score: t.score })));
  console.log("");

  // ---- Step 4: verdict ----
  console.log("Step 4: rendering verdicts…");
  themes = await decideVerdicts(themes);
  logStep("verdict", { themes: themes.map((t) => t.theme_id) }, themes.map((t) => ({ theme_id: t.theme_id, verdict: t.verdict, confidence: t.confidence, rationale: t.rationale })));
  console.log("");

  // ---- Step 5: self-check ----
  console.log(`Step 5: self-check (confidence < ${CONFIDENCE_THRESHOLD} → needs_more_info)…`);
  themes = selfCheck(themes);
  const flaggedCount = themes.filter((t) => t.flagged).length;
  logStep("selfcheck", { threshold: CONFIDENCE_THRESHOLD }, themes.map((t) => ({ theme_id: t.theme_id, flagged: t.flagged, verdict: t.verdict })));
  console.log(`    → ${flaggedCount} theme(s) flagged for more info\n`);

  // ---- Rank + headline number ----
  const ranked = [...themes].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));

  const highPriority = ranked.filter((t) =>
    (HIGH_PRIORITY_VERDICTS as readonly string[]).includes(t.verdict ?? ""),
  );
  const revenueAtRiskSurfaced = highPriority.reduce(
    (sum, t) => sum + (t.score?.revenue_at_risk ?? 0),
    0,
  );

  const results = {
    generated_at: ts,
    model: MODEL,
    run_dir: `runs/${ts}`,
    signal_count: signals.length,
    account_count: accounts.length,
    theme_count: ranked.length,
    confidence_threshold: CONFIDENCE_THRESHOLD,
    // The headline number — computed from the data, not hardcoded.
    revenue_at_risk_surfaced: revenueAtRiskSurfaced,
    high_priority_theme_ids: highPriority.map((t) => t.theme_id),
    themes: ranked,
  };
  writeFileSync(join(ROOT, "results.json"), JSON.stringify(results, null, 2) + "\n");
  // Keep a copy inside the run dir too, so each run is self-contained.
  writeFileSync(join(runDir, "results.json"), JSON.stringify(results, null, 2) + "\n");

  // ---- Console summary ----
  console.log("─".repeat(64));
  console.log("RANKED THEMES");
  console.log("─".repeat(64));
  for (const t of ranked) {
    const flag = t.flagged ? " ⚑" : "";
    console.log(
      `${(t.score?.total ?? 0).toFixed(3)}  ${t.verdict?.padEnd(16)} $${(t.score?.revenue_at_risk ?? 0).toLocaleString().padStart(10)}  ${t.title}${flag}`,
    );
  }
  console.log("─".repeat(64));
  console.log(
    `Revenue-at-risk surfaced (pursue themes): $${revenueAtRiskSurfaced.toLocaleString()}`,
  );
  console.log(`Full results → results.json  |  audit trail → runs/${ts}/\n`);
}

main().catch((err) => {
  console.error("\nPipeline failed:", err);
  process.exit(1);
});
