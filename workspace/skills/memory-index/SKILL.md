---
name: memory-index
description: Keep MEMORY.md clean as a stable index + guardrails (not a diary). Use when reorganizing memory, deciding what to save where, refactoring MEMORY.md, or moving long content into vault notes and Agent Vault learnings.
---

# Memory index + vault hygiene

## Core rule
`MEMORY.md` is an **index and guardrails**, not a diary.

- If it won’t matter in **30–90 days**, it should **not** live inline in `MEMORY.md`.
- If it’s a reusable fact/decision/playbook, store it as a **vault note** and link to it.
- If it’s a short, durable, searchable learning, store it in **Agent Vault** via the `agent-learnings` skill (no secrets; keep learnings ≤8000 chars).

## What goes where

### 1) `MEMORY.md` (stable index)
Keep ~200–400 lines. Only:
- Identity + stable user preferences
- Hard safety rules (no secrets)
- Maps (links only)
- Stable decisions (ADR-style, short + link)
- Playbooks (links only)
- Domain indexes (links only)

Never store:
- long tactical chat logs
- incident timelines
- large data dumps
- file inventories / long lists of absolute paths
- anything credential-adjacent (beyond “use env vars / secrets manager”)

### 2) Dailies (tactical)
Put tactical notes in dated files:
- `vault/dailies/YYYY-MM-DD.md`

### 3) Vault notes (structured docs)
Use predictable folders under the workspace volume:
- `vault/domains/` — stable domain/system notes
- `vault/playbooks/` — runbooks & troubleshooting
- `vault/decisions/` — ADRs
- `vault/<domain>/...` — domain-specific indexes (e.g., `vault/finance/2025/index.md`)

### 4) Agent Vault learnings (durable + searchable)
Use the **`agent-learnings`** skill.
- Do not store secrets.
- Prefer short, high-signal learnings.

## Process: rewrite a messy `MEMORY.md`
1) Classify each block as: **Invariant**, **Decision**, **Playbook**, **Domain note**, or **Daily/incident**.
2) Move full text into the right vault note (or Agent Vault learning).
3) Replace original text in `MEMORY.md` with a 1–2 line summary + link.
4) Enforce a size cap and prune periodically.

## `MEMORY.md` template (target skeleton)
1) Purpose
2) Identity & defaults
3) Hard rules
4) Maps (links)
5) Stable decisions (ADRs, links)
6) Playbooks (links)
7) Domain indexes (links)
