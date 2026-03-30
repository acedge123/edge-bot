---
name: memory-index
description: "Keep MEMORY.md clean: use it as a stable index + guardrails; store durable knowledge in Agent Vault via agent-learnings; store tactical logs in dailies. Use when reorganizing memory or deciding what to save where."
---

# Memory index + vault hygiene

This skill defines the **canonical structure** for `MEMORY.md` and how it interacts with:

- **Dailies** (tactical, dated logs)
- **Vault notes** (domain docs, playbooks, decisions)
- **Agent Vault (Supabase)** via the **`agent-learnings`** skill (durable, queryable learnings)

## Core rule

`MEMORY.md` is an **index and guardrails**, not a diary.

- If it won’t matter in **30–90 days**, it should **not** live inline in `MEMORY.md`.
- If it’s a reusable “fact/decision/playbook,” it should be stored as a **vault note** or an **Agent Vault learning**, and `MEMORY.md` should link to it.

## What goes where

### 1) `MEMORY.md` (stable index)

Keep under ~200–400 lines. Only:

- Identity + stable user preferences
- Hard safety rules (no secrets; cookie/token handling; etc.)
- Maps (repo map, runtime map, key contracts) — **links only**
- Stable decisions (ADR-style, one paragraph each) — link to deeper note
- Playbooks (links only)
- Domain indexes (links only)

Never store:

- long tactical chat logs
- incident timelines
- large data dumps or file inventories
- anything credential-adjacent beyond “use env vars / secrets manager”

### 2) Dailies (tactical)

Put tactical notes and incident logs in dated files, e.g.:

- `vault/dailies/YYYY-MM-DD.md`

Each daily can contain raw context, commands tried, intermediate results, and links to artifacts.

### 3) Vault notes (structured docs)

Use predictable folders:

- `vault/domains/` — stable system/domain understanding
- `vault/playbooks/` — procedures and troubleshooting runbooks
- `vault/decisions/` — ADRs (what we decided + why)
- `vault/finance/`, `vault/ops/`, etc. — domain-specific artifacts and summaries

### 4) Agent Vault learnings (durable + searchable)

Use the **`agent-learnings`** skill to store reusable knowledge in Supabase:

- Decisions that matter later
- Proven fixes and runbooks
- Contracts and invariants

Do **not** store secrets or large blobs. Prefer short, high-signal learnings.

## How to rewrite a messy MEMORY.md (process)

1. Classify each block as: **Invariant**, **Decision**, **Playbook**, **Domain note**, or **Daily/incident**.
2. Move the full text into the right vault note (or Agent Vault learning).
3. Replace the original block in `MEMORY.md` with a **1–2 line summary + link**.
4. Enforce a “size cap” on `MEMORY.md` and do periodic pruning.

## `MEMORY.md` template (target shape)

Use this exact skeleton unless user asks otherwise:

1. **Purpose** (what belongs here vs elsewhere)
2. **Identity & defaults**
3. **Hard rules (security + behavior)**
4. **Maps (links)**
5. **Stable decisions (ADRs, links)**
6. **Playbooks (links)**
7. **Domain indexes (links)**

## Interaction with Agent Vault schema (important)

Agent Vault `POST /learnings` constraints (from `docs/AGENT_VAULT.md`):

- `learning` required, max **8000** chars
- `confidence` in **[0,1]**
- `tags` is an array of strings (keep short)

Recommended conventions for learnings:

- `category`: one of `deploy`, `troubleshooting`, `governance`, `slack`, `finance`, `ops`, `security`, `repos`
- `tags`: include repo names, endpoint names, and environment (`railway`, `supabase`)
- `metadata`: small JSON only (no big payloads, no secrets)

