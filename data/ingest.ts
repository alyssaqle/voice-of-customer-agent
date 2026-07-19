/**
 * Ingestion / wrangling layer.
 *
 * Real Voice-of-Customer input is NOT one neat table — it arrives from many
 * sources with different shapes. This module normalizes each into the unified
 * Signal schema and merges them:
 *
 *   - reviews-real.txt  → real Google Play reviews (Asana/Monday), ANONYMOUS
 *                         (source: app_review, account_id: null)
 *   - slack-signals.txt → synthetic internal Slack, ACCOUNT-LINKED
 *                         (source: slack, account_id: acc_xxx)
 *   - optional *.csv    → swap in your own dataset (e.g. a Kaggle support-ticket
 *                         CSV). See loadTicketsCSV() + the README.
 *
 * The account-linked sources are what let the scorer compute revenue-at-risk;
 * anonymous reviews cannot be joined to revenue — which is exactly the point.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Account, Signal, Source } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(__dirname, "sources");

/** Strip comment (#) and blank lines from a source file. */
function dataLines(file: string): string[] {
  return readFileSync(join(SOURCES_DIR, file), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

/** "2025-03-18" → ISO. "-" / invalid → a fixed fallback so runs are reproducible. */
function toIso(date: string): string {
  const d = date && date !== "-" ? new Date(date + "T12:00:00Z") : null;
  return d && !isNaN(d.getTime()) ? d.toISOString() : "2025-03-01T12:00:00Z";
}

/** reviews-real.txt: "YYYY-MM-DD [Product] text" → anonymous app_review signals. */
function loadReviews(): Omit<Signal, "id">[] {
  return dataLines("reviews-real.txt").map((line) => {
    const m = line.match(/^(\S+)\s+\[[^\]]*\]\s+(.*)$/);
    const date = m ? m[1] : "-";
    const text = m ? m[2] : line;
    return { source: "app_review" as Source, text, timestamp: toIso(date), account_id: null };
  });
}

/** slack-signals.txt: "[acc_xxx] YYYY-MM-DD | message" → account-linked slack signals. */
function loadSlack(validAccounts: Set<string>): Omit<Signal, "id">[] {
  return dataLines("slack-signals.txt").map((line) => {
    const m = line.match(/^\[(\w+)\]\s+(\S+)\s*\|\s*(.*)$/);
    if (!m) throw new Error(`Malformed slack line: ${line}`);
    const [, account_id, date, text] = m;
    if (!validAccounts.has(account_id)) {
      throw new Error(`Slack signal references unknown account ${account_id}`);
    }
    return { source: "slack" as Source, text, timestamp: toIso(date), account_id };
  });
}

/**
 * Optional swap-in: any `*-tickets.csv` in data/sources/ is treated as support
 * tickets. Expects a column named `text`, `Content`, `Ticket Description`, or
 * `description`. Each ticket is deterministically assigned to a CRM account so
 * it joins to revenue (a demo stand-in for the real ticket→account CRM link).
 * This is how you'd point the pipeline at e.g. the Kaggle
 * suraj520/customer-support-ticket-dataset — see the README.
 */
function loadTicketsCSV(accounts: Account[]): Omit<Signal, "id">[] {
  const csvs = existsSync(SOURCES_DIR)
    ? readdirSync(SOURCES_DIR).filter((f) => f.toLowerCase().endsWith("-tickets.csv"))
    : [];
  if (csvs.length === 0) return [];

  const out: Omit<Signal, "id">[] = [];
  let counter = 0;
  for (const file of csvs) {
    const rows = parseCSV(readFileSync(join(SOURCES_DIR, file), "utf8"));
    if (rows.length < 2) continue;
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const textCol = ["text", "content", "ticket description", "description"]
      .map((c) => header.indexOf(c))
      .find((i) => i >= 0);
    if (textCol === undefined) {
      console.warn(`  ⚠ ${file}: no recognized text column; skipping`);
      continue;
    }
    for (const row of rows.slice(1)) {
      const text = (row[textCol] ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 15) continue;
      // Deterministic account assignment (round-robin over paying accounts).
      const paying = accounts.filter((a) => a.tier !== "free");
      const account_id = paying[counter % paying.length].account_id;
      counter++;
      out.push({ source: "support_ticket", text, timestamp: "2025-03-01T12:00:00Z", account_id });
    }
  }
  return out;
}

/** Merge all sources into a unified, id-stamped Signal list. */
export function ingestSignals(accounts: Account[]): Signal[] {
  const validAccounts = new Set(accounts.map((a) => a.account_id));
  const merged: Omit<Signal, "id">[] = [
    ...loadReviews(),
    ...loadSlack(validAccounts),
    ...loadTicketsCSV(accounts),
  ];
  return merged.map((s, i) => ({ id: `sig_${String(i + 1).padStart(4, "0")}`, ...s }));
}

// Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines).
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
