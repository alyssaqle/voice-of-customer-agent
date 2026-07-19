/**
 * Step 3 — Prioritization scoring.
 *
 * This is a PURE function — no LLM. Everything here is inspectable and testable,
 * which is the point: a human (or an interviewer) can read exactly why a theme
 * ranked where it did. The four components come from config.ts (SCORE_WEIGHTS,
 * SOURCE_AUTHORITY) so the weighting is tunable without touching this logic.
 *
 * priority = w_vol·volume_norm
 *          + w_sev·severity_norm
 *          + w_auth·authority_weight
 *          + w_rev·revenue_norm
 *
 * where each component is normalized to ~0..1 so the weights are comparable.
 */

import type { Account, ScoreBreakdown, Signal, Theme } from "../types.js";
import { SCORE_WEIGHTS, SOURCE_AUTHORITY } from "../../config.js";

export function scoreThemes(
  themes: Theme[],
  signals: Signal[],
  accounts: Account[],
): Theme[] {
  const signalById = new Map(signals.map((s) => [s.id, s]));
  const revenueByAccount = new Map(
    accounts.map((a) => [a.account_id, a.annual_revenue]),
  );

  // ---- First pass: compute the raw (un-normalized) components per theme. ----
  const raw = themes.map((theme) => {
    const themeSignals = theme.signal_ids
      .map((id) => signalById.get(id))
      .filter((s): s is Signal => Boolean(s));

    const volume = themeSignals.length;

    // severity is already 1..5 from step 1; scale to 0..1.
    const severity_norm = theme.severity / 5;

    // authority = mean source-authority weight of the theme's signals.
    // A theme fed by sales-call notes outranks one fed by anonymous reviews.
    const authority_weight =
      volume === 0
        ? 0
        : themeSignals.reduce((sum, s) => sum + SOURCE_AUTHORITY[s.source], 0) /
          volume;

    // revenue at risk = sum of annual_revenue over the DISTINCT accounts whose
    // signals feed this theme. Distinct so a single loud account can't inflate it.
    // Anonymous signals (account_id === null, e.g. app reviews) contribute no
    // revenue — only identified sources (Slack, tickets) join to the CRM.
    const accountIds = new Set(
      themeSignals
        .map((s) => s.account_id)
        .filter((id): id is string => id !== null),
    );
    let revenue_at_risk = 0;
    for (const id of accountIds) revenue_at_risk += revenueByAccount.get(id) ?? 0;

    return { theme, volume, severity_norm, authority_weight, revenue_at_risk };
  });

  // ---- Normalization constants across the whole theme set. ----
  // Volume is log-scaled first (a theme with 40 signals isn't 40x more important
  // than one with 1), then normalized against the largest log-volume.
  const logVol = (v: number) => Math.log1p(v);
  const maxLogVolume = Math.max(...raw.map((r) => logVol(r.volume)), 1e-9);
  const maxRevenue = Math.max(...raw.map((r) => r.revenue_at_risk), 1e-9);

  // ---- Second pass: normalize + combine into the final score. ----
  return raw.map((r) => {
    const volume_norm = logVol(r.volume) / maxLogVolume;
    const revenue_norm = r.revenue_at_risk / maxRevenue;

    const total =
      SCORE_WEIGHTS.volume * volume_norm +
      SCORE_WEIGHTS.severity * r.severity_norm +
      SCORE_WEIGHTS.authority * r.authority_weight +
      SCORE_WEIGHTS.revenue * revenue_norm;

    const score: ScoreBreakdown = {
      volume: r.volume,
      severity_norm: round(r.severity_norm),
      authority_weight: round(r.authority_weight),
      revenue_at_risk: r.revenue_at_risk,
      revenue_norm: round(revenue_norm),
      total: round(total),
    };
    return { ...r.theme, score };
  });
}

const round = (n: number) => Math.round(n * 1000) / 1000;
