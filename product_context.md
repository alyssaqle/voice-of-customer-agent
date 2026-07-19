# TaskFlow — Product Context

> This file grounds the pipeline. The Grounding agent (step 2) reads it to avoid
> proposing things we've already shipped or that are explicitly out of scope.
> Edit it to reflect real constraints — the pipeline picks up changes next run.

## What TaskFlow is

A project-management SaaS (task boards, timelines, collaboration) sold to teams
and enterprises — the same category as Asana and Monday, whose public app-store
reviews are the raw feedback in this demo. We sell per-seat, mostly to
mid-market and enterprise, with a free tier for small teams.

## Current quarter goal

Reduce churn among at-risk enterprise accounts by shipping what blocks renewals
and expansions — not just the loudest complaint in the app-store reviews.

## Already shipped (do NOT propose building these)

- **Task boards, lists, and timeline views** (core product) on web and mobile.
- **Mobile apps** (iOS + Android, React Native) — though with known stability
  and feature-parity gaps (see Known issues).
- **Basic push + email notifications** for assignments and due dates (delivery
  timing is unreliable at scale — see Known issues).
- **One-way calendar export** (tasks → Google/Outlook calendar).
- **Basic Jira import** (one-time, one-way).
- **Email/password + Google OAuth login.**

## On the roadmap (already planned — flag, don't re-propose as novel)

- **Two-way Jira sync** — committed this quarter; engineering has started. Our
  #1 enterprise integration ask.
- **SAML / enterprise SSO** — planned next quarter; required by several security
  reviews.
- **Mobile feature parity** (bulk edit, reorder, offline) — planned, phased.

## Out of scope (technical or strategic constraints — decline these)

- **Building our own video conferencing / chat.** We integrate with Slack, Zoom,
  and Teams; we will not build a competing real-time comms product.
- **On-premise / self-hosted deployment.** We are cloud-only this year.
- **Replacing the pricing model with usage-based billing.** Per-seat pricing is
  fixed for the year; discounting is a sales lever, not a product change.

## Known issues engineering already knows about

- Push-notification delivery timing is unreliable at peak load.
- Large boards (500+ tasks) render slowly, especially on mobile.
- Android mobile app has intermittent crashes (file attachment, notifications).

## Tech constraints

- Mobile clients are React Native; backend is a Postgres + Node monolith.
- No real-time streaming infra today (relevant to any "live sync" ask).
