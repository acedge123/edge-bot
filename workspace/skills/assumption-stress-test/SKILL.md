---
name: assumption-stress-test
description: Adversarial review ("devil’s advocate" / red-team) for brainstorms, technical designs, and project kickoff docs. Use when asked to challenge assumptions, find weak spots, surface counter-arguments, identify missing evidence, propose disconfirming tests, or critique a Markdown document (PRD, RFC, ADR, architecture notes, go-to-market plan, brainstorm) before execution.
---

# Assumption Stress Test

Provide a structured, good-faith but skeptical critique of an idea/design. The goal is not “be negative”; it’s to prevent avoidable failures by identifying:
- hidden assumptions
- missing constraints
- unclear definitions
- unproven claims
- edge cases and failure modes
- security/privacy/compliance risks
- operational and maintenance risk
- places where quick tests can validate/kill the idea

## Workflow

### 1) Restate the proposal (charitably, briefly)
- Summarize the document/idea in 3–7 bullets.
- If the doc is ambiguous, explicitly list the interpretation choices you made.

### 2) Extract assumptions (make them falsifiable)
Produce a list of assumptions with:
- **Assumption** (as a declarative claim)
- **Why it matters** (what breaks if false)
- **How to test** (fastest/cheapest disconfirming test)

Examples of assumption types to look for:
- user behavior / adoption
- performance and scale
- unit economics
- data availability/quality
- dependency reliability (APIs, vendors, upstream systems)
- timelines and staffing
- legal/compliance/privacy
- security model / threat model

### 3) Attack the weakest links (counter-arguments)
For each high-impact assumption or claim, provide:
- **Counter-argument** (what a skeptical reviewer would say)
- **Evidence needed** (what would convince you)
- **Mitigation / alternative** (ways to reduce the risk)

Prefer concrete mechanisms over vibes.

### 4) Failure modes + edge cases
List failure modes by category:
- **Product** (wrong problem, UX dead ends)
- **Engineering** (integration complexity, reliability, observability, migrations)
- **Data** (drift, missing labels, leakage, privacy)
- **Security** (authz/authn, secrets, multi-tenant boundaries, abuse)
- **Ops** (oncall burden, runbooks, cost spikes)

If appropriate, include a small “pre-mortem”: *“It’s 6 months later and this failed—why?”*

### 5) Decision-quality improvements
Recommend changes that make the document “decision-grade”:
- missing definitions (“done”, “MVP”, “success metrics”)
- missing acceptance criteria
- missing non-goals
- unclear ownership and dependencies
- missing rollback / exit strategy

### 6) Fast tests checklist (prove or kill)
Give 3–10 tests/experiments, ordered by expected information gain per unit effort.
Each test should include:
- **Hypothesis**
- **Method**
- **Pass/Fail threshold**
- **Time/cost estimate** (rough)

### 7) Output format (required)
When delivering the critique, use this structure:

1. **Summary of proposal**
2. **Top risks (ranked)** (include Severity: High/Med/Low)
3. **Key assumptions + disconfirming tests**
4. **Counter-arguments & evidence needed**
5. **Failure modes / edge cases**
6. **Recommendations (doc changes + technical changes)**

If the user asks for “commands / proof points,” include concrete verification ideas (examples):
- reproduce with a minimal spike / prototype
- load test plan and SLOs
- security checks (authz matrix, threat model)
- cost model sanity check (back-of-envelope)
- API contract tests

## Guardrails

- Be specific: point to exact statements/sections when possible.
- Prefer disconfirming tests over “more research”.
- Don’t invent facts; label uncertainty and what would resolve it.
- If the proposal is actually solid, say so—but still list the top 2–3 residual risks.
