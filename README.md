# voice-of-customer-agent

Voice of Customer Agent

Introduction

In this project, I use a multi-agent pattern to turn raw, multi-source product feedback into decision-ready insights. These agents collaborate to weigh each signal by who raised it and what account it's worth, ground it against team's constraints and roadmap, and formulate a prioritized verdict that a product manager approves.

A crash reported in three anonymous app reviews might not always be the signal; the same crash flagged in a #sales-signals channel as blocking a $2M renewal is critical. The system tells the difference because it reads the message and looks up the account behind it.

A case study runs through the repo: a campus food-ordering company deciding what to act on for its at-risk enterprise accounts this quarter.

AI Agents used:

Clustering Agent: Reads feedback from every source — app reviews and Slack channels — and groups it into candidate themes, tracking which channel each theme came from.
Grounding Agent: Weighs each theme by source authority (an account executive's Slack signal outranks raw review counts), looks up the CRM account behind it to weight by revenue, and checks it against the team's tech constraints, product strategy, and roadmap. It then renders a verdict — Pursue, Already planned, Park, Decline, or Need more info — with a confidence level and the evidence it used, declining to guess when the context is thin.

A human approves or overrides every verdict.
