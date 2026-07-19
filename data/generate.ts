/**
 * Data builder. Produces the two committed inputs the pipeline reads:
 *   - data/accounts.json  — synthetic CRM (see data/accounts.ts)
 *   - data/signals.json   — merged multi-source feedback (see data/ingest.ts)
 *
 * The signals come from REAL app-store reviews (data/sources/reviews-real.txt)
 * plus a synthetic account-linked Slack layer (data/sources/slack-signals.txt),
 * plus any *-tickets.csv you drop in. Re-running is deterministic, so the
 * committed JSON is reproducible.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateAccounts } from "./accounts.js";
import { ingestSignals } from "./ingest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const accounts = generateAccounts(40);
const signals = ingestSignals(accounts);

writeFileSync(join(__dirname, "accounts.json"), JSON.stringify(accounts, null, 2) + "\n");
writeFileSync(join(__dirname, "signals.json"), JSON.stringify(signals, null, 2) + "\n");

// Summary.
const bySource = signals.reduce<Record<string, number>>((m, s) => {
  m[s.source] = (m[s.source] ?? 0) + 1;
  return m;
}, {});
const byTier = accounts.reduce<Record<string, number>>((m, a) => {
  m[a.tier] = (m[a.tier] ?? 0) + 1;
  return m;
}, {});
const linked = signals.filter((s) => s.account_id).length;
const totalRevenue = accounts.reduce((s, a) => s + a.annual_revenue, 0);

console.log(`Built ${accounts.length} accounts and ${signals.length} signals.`);
console.log("Signals by source:", bySource);
console.log(`Account-linked signals: ${linked} (rest are anonymous reviews)`);
console.log("Accounts by tier:", byTier);
console.log(`Total book of business: $${totalRevenue.toLocaleString()}`);
