import { useEffect, useState } from "react";

// Mirrors the theme shape written to results.json by the pipeline.
interface Score {
  volume: number;
  severity_norm: number;
  authority_weight: number;
  revenue_at_risk: number;
  revenue_norm: number;
  total: number;
}
interface Theme {
  theme_id: string;
  title: string;
  summary: string;
  signal_ids: string[];
  severity: number;
  grounding?: { status: string; evidence: string };
  score?: Score;
  verdict?: string;
  rationale?: string;
  confidence?: number;
  flagged?: boolean;
}
interface Results {
  generated_at: string;
  model: string;
  signal_count: number;
  account_count: number;
  revenue_at_risk_surfaced: number;
  themes: Theme[];
}
interface Decision {
  status: "approved" | "rejected" | "edited";
  verdict?: string;
  rationale?: string;
  saved_at?: string;
}

const usd = (n: number) => "$" + Math.round(n).toLocaleString();

export function App() {
  const [results, setResults] = useState<Results | null>(null);
  const [approvals, setApprovals] = useState<Record<string, Decision>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/results")
      .then((r) => r.json())
      .then(setResults)
      .catch(() => setError("Could not load results.json"));
    fetch("/api/approvals")
      .then((r) => r.json())
      .then(setApprovals)
      .catch(() => {});
  }, []);

  async function save(theme_id: string, decision: Omit<Decision, "saved_at">) {
    await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme_id, ...decision }),
    });
    setApprovals((prev) => ({ ...prev, [theme_id]: { ...decision } }));
  }

  if (error) {
    return (
      <div className="empty">
        <h1>Voice of Customer</h1>
        <p>{error}. Run <code>npm run pipeline</code> first to generate <code>results.json</code>.</p>
      </div>
    );
  }
  if (!results) return <div className="empty">Loading…</div>;

  const approvedCount = Object.values(approvals).filter((d) => d.status === "approved").length;

  return (
    <div className="app">
      <header>
        <h1>Voice of Customer — What to build next</h1>
        <div className="stats">
          <Stat label="Signals" value={results.signal_count.toLocaleString()} />
          <Stat label="Accounts" value={String(results.account_count)} />
          <Stat label="Themes" value={String(results.themes.length)} />
          <Stat label="Revenue-at-risk surfaced" value={usd(results.revenue_at_risk_surfaced)} highlight />
          <Stat label="Approved" value={`${approvedCount} / ${results.themes.length}`} />
        </div>
        <p className="meta">
          Model {results.model} · generated {results.generated_at} · nothing is final until you approve it.
        </p>
      </header>

      <div className="cards">
        {results.themes.map((t, i) => (
          <ThemeCard
            key={t.theme_id}
            rank={i + 1}
            theme={t}
            decision={approvals[t.theme_id]}
            onSave={save}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={"stat" + (highlight ? " highlight" : "")}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ThemeCard({
  rank,
  theme,
  decision,
  onSave,
}: {
  rank: number;
  theme: Theme;
  decision?: Decision;
  onSave: (id: string, d: Omit<Decision, "saved_at">) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [verdict, setVerdict] = useState(theme.verdict ?? "");
  const [rationale, setRationale] = useState(theme.rationale ?? "");
  const s = theme.score;

  const status = decision?.status;
  const cardClass =
    "card" +
    (status === "approved" ? " approved" : status === "rejected" ? " rejected" : "") +
    (theme.flagged ? " flagged" : "");

  return (
    <div className={cardClass}>
      <div className="card-head">
        <span className="rank">#{rank}</span>
        <h2>{theme.title}</h2>
        <span className={"badge v-" + (theme.verdict ?? "")}>{theme.verdict}</span>
        {theme.flagged && <span className="badge flag">needs review</span>}
        {status && <span className={"badge decision " + status}>{status}</span>}
      </div>

      <p className="summary">{theme.summary}</p>

      <div className="score-row">
        <ScoreBar label="volume" raw={`${s?.volume} signals`} value={Math.min((s?.volume ?? 0) / 40, 1)} />
        <ScoreBar label="severity" value={s?.severity_norm ?? 0} />
        <ScoreBar label="authority" value={s?.authority_weight ?? 0} />
        <ScoreBar label="revenue" raw={usd(s?.revenue_at_risk ?? 0)} value={s?.revenue_norm ?? 0} />
        <div className="total">
          <div className="total-value">{s?.total?.toFixed(3)}</div>
          <div className="total-label">priority</div>
        </div>
      </div>

      <div className="detail">
        <span className="revenue">{usd(s?.revenue_at_risk ?? 0)} at risk</span>
        <span className="conf">confidence {(theme.confidence ?? 0).toFixed(2)}</span>
        {theme.grounding && (
          <span className={"ground g-" + theme.grounding.status}>{theme.grounding.status}</span>
        )}
      </div>

      {editing ? (
        <div className="edit">
          <label>
            verdict
            <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
              {["pursue", "already_planned", "park", "decline", "needs_more_info"].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            rationale
            <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2} />
          </label>
          <div className="actions">
            <button className="save" onClick={() => { onSave(theme.theme_id, { status: "edited", verdict, rationale }); setEditing(false); }}>
              Save edit
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <p className="rationale">{decision?.rationale ?? theme.rationale}</p>
          <div className="actions">
            <button className="approve" onClick={() => onSave(theme.theme_id, { status: "approved", verdict: theme.verdict, rationale: theme.rationale })}>
              Approve
            </button>
            <button className="edit-btn" onClick={() => setEditing(true)}>Edit</button>
            <button className="reject" onClick={() => onSave(theme.theme_id, { status: "rejected" })}>Reject</button>
          </div>
        </>
      )}
    </div>
  );
}

function ScoreBar({ label, value, raw }: { label: string; value: number; raw?: string }) {
  return (
    <div className="bar-wrap">
      <div className="bar-track">
        <div className="bar-fill" style={{ height: `${Math.round(value * 100)}%` }} />
      </div>
      <div className="bar-label">{label}</div>
      <div className="bar-raw">{raw ?? value.toFixed(2)}</div>
    </div>
  );
}
