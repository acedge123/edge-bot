---
name: maintainability-code-review
description: "Maintainability/tech-debt-focused code review skill for React+TypeScript apps (Lovable), Supabase/Postgres backends, and Vercel deployments, plus Python/Django apps on Railway. Use when reviewing PRs or repos for refactorability, flexibility, and long-term maintenance: architecture/boundaries, typing, testing, data model & migrations, error handling/observability, dependency hygiene, and CI quality gates."
---

# Maintainability code review (tech debt lens)

## What to produce

When asked to review a PR/repo for maintainability, produce:
1) **Executive summary** (what will hurt in 3–12 months)
2) **Top 5 refactor recommendations** (highest leverage, lowest risk first)
3) **Tech-debt inventory** (smells + why they matter)
4) **Risk map** (where change is dangerous / brittle)
5) **Next actions** (1–2 hour, 1–2 day, 1–2 week buckets)

## Core review lens (stack-agnostic)

Also evaluate the repo against the **Unified Architecture** standard in `skills/unified-architecture/SKILL.md`: passive presentation, explicit execution layers, dependency injection, observability, centralized errors, design tokens, stable test hooks, and recovery-first behavior.

### 1) Boundaries & architecture
- Clear separation: UI / domain / data access / integrations.
- Side effects isolated (network, DB, queues) behind adapters.
- Configuration centralized; no scattered env lookups.

### 2) Complexity & readability
- Prefer small functions with intent-revealing names.
- Replace repeated conditional logic with tables/strategies.
- Avoid “god components/services” that know everything.

### 3) Refactor safety
- Tests cover critical flows; tests are stable (not timing brittle).
- Types prevent invalid states; runtime validation exists at boundaries.
- Error handling is consistent (no swallowed exceptions).

### 4) Dependency hygiene
- Minimal deps; pinned versions; update bot configured.
- Avoid abandoned libs; avoid duplicate libs solving same problem.

### 5) Observability & operability
- Structured logs; correlation IDs; safe error messages.
- Rate limits/retries where needed; timeouts everywhere.

## Stack-specific guidance (read only what applies)

- React + TypeScript + Supabase + Vercel: see `references/react-ts-supabase-vercel.md`
- Python + Django + Railway: see `references/django-railway.md`

## Practical heuristics

- Prefer deleting code over adding abstraction.
- Prefer *one* clean pattern over many inconsistent patterns.
- Make “the right thing” the default: lint/format/typecheck/test in CI.

## Common outputs

### A) “What to refactor first” rubric
Prioritize changes that:
- reduce coupling across modules
- remove duplication in auth/permissions/data access
- reduce hidden state (global singletons, implicit env reads)
- add tests around the hottest paths before refactoring

### B) Quick checklist (10 items)
(If time is short, run this and report failures.)
- Single source of truth for env/config
- DB access layer (no ad-hoc SQL scattered)
- RLS/authorization is centralized + testable
- Data validation on inbound requests
- Error boundaries (frontend) / exception middleware (backend)
- Background jobs are idempotent + retriable
- Migrations are reviewed + indexed
- No secrets in client bundle
- CI gates: lint + type + tests
- Dependency updates automated
