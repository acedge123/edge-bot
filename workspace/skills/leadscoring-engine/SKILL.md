---
name: leadscoring-engine
description: "Configure and operate the Lead Scoring Engine (questions, choices, scoring models/ranges, formulas, recommendation rules, and lead scoring submissions). Use for adding/updating questionnaires (e.g., HELOC forms), mapping answers to X/Y/total scores, and returning rule-based recommendations."
---

# Lead Scoring Engine (Django) — Operator Workflow

This skill is for working with the Lead Scoring Engine backend (repo: `acedge123/api-docs-template`, Django app under `backend/`).

## What the system does (mental model)

- A **tenant/owner** has a set of **Questions**.
- Each Question may have a **ScoringModel** (weight + X/Y axis flags + optional formula + ranges → points).
- Each Question may have a **Recommendation** (an `If ...` rule + response/affiliate payload).
- A lead submission provides **answers** keyed by `field_name`.
- The engine normalizes answers → computes per-question points → sums **x_axis**, **y_axis**, **total_score**.
- Then it evaluates recommendation rules (with `{x_axis_score}`, `{y_axis_score}`, `{total_score}` available) and returns matching recommendations.

## Quick workflow (most common)

Live validation note (2026-04-22): the production Django API at `api-docs-template-production.up.railway.app` accepted DRF auth via `Authorization: Token <api_token>` on `/api/v1/questions/` and `/api/v1/scoring-models/`.

1) **Gather form questions** (UI route like `/heloc/short/v1`) and turn them into canonical Question definitions:
   - `field_name` (snake_case)
   - `number` (1..N)
   - `text`
   - `type` (CH/MC/O/I/S/D)
   - `choices[]` for CH/MC
   - `min_value`/`max_value` for S/I

2) **Create/update questions** via API:
   - Prefer bulk upsert action: `domain.leadscoring.questions.upsert_bulk` (see references).
   - When setting up a new client question set, always give the user the exact `field_name` list and field types, because downstream payload mapping must be exact.

3) **Attach scoring**:
   - For each question that affects score: create/update a ScoringModel:
     - `weight`
     - `x_axis` / `y_axis`
     - optional `formula` (uses `{field_name}` placeholders)
   - Add ranges (ValueRange or DatesRange) that map the computed value into points.

4) **Add recommendations**:
   - For each question where you want a rule-triggered output, create a Recommendation:
     - `rule` must begin with `If`
     - can reference question values like `{credit_score}`
     - can reference computed totals: `{x_axis_score}`, `{y_axis_score}`, `{total_score}`

5) **Test**:
   - Submit a lead with answers; verify x/y/total and which recommendations fire.

## Rule + formula constraints (practical)

- Rules and formulas are validated by regex and evaluated with `eval()` after sanitization.
- Allowed constructs include arithmetic operators, comparisons, boolean `and/or/not`, parentheses, and some helper funcs.
- Multi-value questions support indexed references like `{field_name[0]}` / `{field_name[-1]}`.

## When to read deeper

- Endpoint shapes + payload examples: read `references/api_endpoints.md`.
- Rule/formula syntax & helper functions: read `references/rules_and_formulas.md`.
- Data model cheat sheet (Question types, what becomes a numeric value, what is usable in rules): read `references/data_model.md`.
