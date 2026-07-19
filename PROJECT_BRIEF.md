# Project Brief — Voice-of-Customer Agent

> A hand-off doc for writing a resume from this project. Every number here is
> computed from an actual run (`results.json`, `eval/results.json`) — nothing is
> estimated. Read the "honesty flags" before claiming a number in an interview.

---

## One-liner

An AI-native tool that turns messy, multi-source customer feedback into a
ranked, revenue-weighted list of *what to build next* — with a human approving
every decision.

## The problem

Product teams drown in feedback from disconnected channels (app-store reviews,
support tickets, sales calls, internal Slack). The loudest complaint isn't the
most important one. A crash in 3 anonymous reviews looks minor; the same crash
flagged in a sales channel as blocking a **$1.7M renewal** is critical. Teams
can't tell the difference at scale because volume is easy to count and *account
value* is not. This tool makes that distinction automatically.

## What it does

A **5-step agentic pipeline** on Claude (Anthropic's LLM):
1. **Theme extraction** — clusters 300+ raw signals into ~15 themes.
2. **Grounding** — checks each theme against real product constraints & roadmap.
3. **Scoring** — a transparent, tunable formula ranks each theme.
4. **Verdict** — pursue / already-planned / park / decline + confidence.
5. **Self-check** — downgrades low-confidence verdicts to "needs more info."

Then a **human-in-the-loop dashboard** (Approve / Edit / Reject) with a full
score breakdown. Nothing is final until a person approves it.

## The key idea (differentiator)

The score weights four factors: **volume**, **severity**, **source authority**
(a sales note outranks an anonymous review), and **revenue-at-risk** (it looks
up the *account* behind each signal and sums annual revenue at stake). Anonymous
reviews contribute volume but zero revenue — only identified sources join to the
CRM. That's what lets a lower-volume, high-revenue enterprise signal beat a wall
of anonymous complaints.

---

## The customer pain points it identified (real run output)

| Pain point | Severity | Revenue at risk | Verdict |
|---|---|---|---|
| App crashes / freezing / instability | 5 | $3.3M | **pursue** |
| Login / SSO / authentication failures | 5 | $2.6M | **pursue** |
| Unreliable integrations (Jira, Calendar, Slack) | 4 | $2.1M | already planned |
| Mobile lacks desktop feature parity | 3 | $1.7M | already planned |
| Slow performance on large boards | 4 | $1.7M | **pursue** |
| Broken task creation/editing | 5 | — | pursue |
| Data loss / disappearing projects | 5 | — | needs more info |
| Confusing / costly pricing | 3 | $0.3M | decline |

**Revenue-at-risk surfaced across pursue themes: $7,554,000.**

---

## Real numbers to pull

- **$7.55M** revenue-at-risk surfaced
- **13/15 (87%)** agreement with expert-PM labels on the eval
- **302 signals · 40 accounts · 15 themes · 5-step pipeline**
- **~99%** fewer API calls via batching (288 → 3)
- Runtime **~4 min** end-to-end (after fixing a truncation stall)

---

## Resume bullets

### Pain-point framing
> Built an agentic AI system that **identifies and prioritizes customer pain
> points** — a 5-step Claude pipeline (extract → ground → score → verdict →
> self-check) that clusters 300+ multi-source signals into 15 themes and
> quantifies each by revenue at risk, surfacing **$7.55M** in at-risk revenue
> concentrated in the top pain points (mobile crashes, SSO failures, performance).

### The three "AI PM" outcome bullets

**1. Shipped an AI feature**
> Shipped an agentic AI feedback-prioritization system end-to-end — a 5-step
> Claude pipeline plus a human-in-the-loop approval dashboard — that identified
> and ranked 15 customer pain points from 300+ multi-source signals and surfaced
> **$7.55M** in revenue-at-risk.

**2. Ran model evaluations**
> Built and ran an evaluation harness measuring the prioritization against 15
> hand-labeled expert-PM cases (including adversarial edge cases), reporting an
> honest **13/15 (87%)** agreement rate and documenting the two failure modes
> rather than hiding them.

**3. Made latency / cost / quality tradeoffs**
> Made explicit latency/cost/quality tradeoffs on the LLM pipeline: batched 288
> signals into 3 clustering calls instead of one-per-signal (**~99% fewer API
> calls**); diagnosed and fixed a token-budget truncation that was stalling runs,
> taking the pipeline from unreliable to a steady **~4-minute** end-to-end run;
> and kept the model a swappable config constant (Opus 4.8 for quality, Sonnet 5
> for cheaper/faster runs).

---

## How to defend each claim (interviewers will ask)

- **"Why did batching cut cost?"** — Naive design calls the LLM once per signal
  (288 calls). Clustering all signals in one call = 3 total LLM calls for the
  whole pipeline (extract + ground + verdict). Same coverage, ~99% fewer calls.
- **"What was the latency bug?"** — Adaptive-thinking tokens shared the output
  budget with the JSON; emitting IDs for ~300 signals truncated the JSON →
  parse failure → silent retry loop that stalled a step past 13 min. Fix:
  switched to streaming and raised/tuned the output budget + effort.
- **"How agentic is it, really?"** — It's an **agentic workflow**: the model
  reasons across five steps and self-checks its confidence, but every action is
  human-approved. Not a fully autonomous tool-using agent — a deliberate boundary
  for a revenue-impacting decision.
- **"Is the eval the whole pipeline?"** — No; it tests the deterministic
  *scoring* component (volume/severity/authority/revenue → ranking) against
  expert labels. State that plainly.

## Honesty flags (say these, don't hide them)

- **Data is real reviews + synthetic CRM.** 288 real Google Play reviews of
  Asana & Monday (public Kimola/nlp-datasets, attributed) + synthetic internal
  Slack + synthetic CRM accounts. Real internal/CRM data is proprietary, so
  those are realistic stand-ins. Call it "synthetic-but-realistic."
- **The 70% latency figure isn't a healthy baseline** — the 13-min run was a
  stalled/failing retry loop. Frame it as "eliminated a stall," not "optimized a
  slow-but-working job." The ~99% API-call reduction has no such caveat.
- **The eval is 13/15, not 15/15** — two adversarial cases fail (the scorer can
  over-weight revenue vs. a widespread severe bug). That honesty is a strength.

## Skills demonstrated (for an AI-native PM role)

- **Problem framing** — recognized prioritization needs source-attribution +
  revenue data, and built the dataset to have both.
- **Prioritization logic** — authored a transparent, tunable scoring model, not
  a black box.
- **AI product rigor** — built an eval and reported an honest number, including
  failures.
- **Responsible AI / human-in-the-loop** — confidence self-check + human
  approval gate.
- **Systems thinking** — mapped the design to a production Salesforce stack
  (Agentforce = agent runtime, Data Cloud = customer/revenue join, Slack =
  approval surface).

## Tech stack

TypeScript/Node · Claude API (Anthropic SDK, structured JSON output + streaming)
· React + Vite dashboard · local JSON storage. Runnable and reproducible locally.
