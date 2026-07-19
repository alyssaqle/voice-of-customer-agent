/**
 * Synthetic CRM — the "Data Cloud / Salesforce" stand-in.
 *
 * Real CRM data is proprietary, so the customer accounts are mocked: ~40 B2B
 * customers of a project-management SaaS (think Asana/Monday's own customers),
 * with widely varying annual revenue and tiers. Seeded → reproducible.
 *
 * These accounts are what the account-linked signals (Slack, and any support
 * tickets you swap in) join against to compute revenue-at-risk. Anonymous app
 * reviews do NOT map to an account — that's the whole point of the weighting.
 */

import type { Account, Tier } from "../src/types.js";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260715);
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
function pickWeighted<T>(entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of entries) if ((r -= w) <= 0) return v;
  return entries[entries.length - 1][0];
}

const PREFIX = [
  "Northwind", "Vertex", "Meridian", "Cobalt", "Ridgeline", "Lumen", "Atlas",
  "Kestrel", "Ironclad", "Solstice", "Harbor", "Beacon", "Granite", "Cedar",
  "Halcyon", "Onyx", "Summit", "Pinnacle", "Wavelength", "Brightpath",
  "Keystone", "Tideline", "Sterling", "Evergreen",
];
const KIND = ["Labs", "Logistics", "Digital", "Systems", "Health", "Financial", "Retail Group", "Media", "Robotics", "Analytics"];

export function generateAccounts(n = 40): Account[] {
  const used = new Set<string>();
  const accounts: Account[] = [];
  for (let i = 0; i < n; i++) {
    const tier: Tier = pickWeighted<Tier>([
      ["enterprise", 0.25],
      ["growth", 0.4],
      ["free", 0.35],
    ]);
    let name = "";
    do {
      name = `${pick(PREFIX)} ${pick(KIND)}`;
    } while (used.has(name));
    used.add(name);

    let annual_revenue = 0;
    if (tier === "enterprise") annual_revenue = randInt(250, 1800) * 1000;
    else if (tier === "growth") annual_revenue = randInt(30, 240) * 1000;

    accounts.push({
      account_id: `acc_${String(i + 1).padStart(3, "0")}`,
      name,
      annual_revenue,
      tier,
    });
  }
  return accounts;
}
