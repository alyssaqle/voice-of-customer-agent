// Shared schema types for the whole project.
// Signals + Accounts are the raw inputs (generated in data/generate.ts).
// Theme is the object the pipeline builds up across steps 1-5.

export type Source =
  | "app_review"
  | "support_ticket"
  | "slack"
  | "sales_call"
  | "survey";

export type Tier = "enterprise" | "growth" | "free";

/** One raw piece of customer feedback. Matches the schema in the build spec.
 *  account_id is null for anonymous sources (e.g. public app-store reviews) —
 *  those contribute volume + authority but no revenue-at-risk. */
export interface Signal {
  id: string;
  source: Source;
  text: string;
  timestamp: string; // ISO 8601
  account_id: string | null;
}

/** A customer account pulled from "CRM". Revenue drives prioritization. */
export interface Account {
  account_id: string;
  name: string;
  annual_revenue: number;
  tier: Tier;
}

// ---- Pipeline output types (used from stage 2 onward; defined here so the
// ---- schema lives in one place). The generator only needs Signal + Account.

export type Sentiment = "positive" | "neutral" | "negative";

export type GroundingStatus =
  | "novel"
  | "already_shipped"
  | "out_of_scope"
  | "on_roadmap";

export type Verdict =
  | "pursue"
  | "already_planned"
  | "park"
  | "decline"
  | "needs_more_info";

export interface ScoreBreakdown {
  volume: number; // distinct signals mapped to the theme
  severity_norm: number; // 0..1
  authority_weight: number; // mean source weight, 0..1-ish
  revenue_at_risk: number; // $ summed over distinct accounts
  revenue_norm: number; // 0..1 (revenue_at_risk normalized across themes)
  total: number; // final priority score
}

export interface Theme {
  theme_id: string;
  title: string;
  summary: string;
  signal_ids: string[];
  severity: number; // 1..5 (aggregated)
  sentiment: Sentiment;
  grounding?: { status: GroundingStatus; evidence: string };
  score?: ScoreBreakdown;
  verdict?: Verdict;
  rationale?: string;
  confidence?: number; // 0..1
  flagged?: boolean; // true => needs_more_info self-check tripped
}
