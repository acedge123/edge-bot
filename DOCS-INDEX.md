# Edge Bot Docs Index

This repo owns hosted runtime and deployment documentation for `edge-bot`.

## “All repos” / multi-repo overview

There is no single file in **this** repo named “ALL repo overview.” Use these instead:

### Repo inventory & integration map (sunafusion-agent-shell)

The **scanned repo inventory**, routes/functions map, integration graph, and related summaries live under **`repo-map/`** in [sunafusion-agent-shell](https://github.com/acedge123/sunafusion-agent-shell):

- [repo-map on GitHub](https://github.com/acedge123/sunafusion-agent-shell/tree/main/repo-map) — `inventory.md` / `inventory.json`, `integration-graph.md`, `routes-and-functions.md`, `schemas.md`, domain summaries, load/query notes in `README.md`

Clone that repo locally to browse or regenerate via `tools/scan-repos.mjs` (see their README).

### ACP architecture (agentic-control-plane-kit)

The **canonical three-repo ACP model** (kernel / runtime / executor) lives in **agentic-control-plane-kit** (clone as a sibling of `edge-bot`, same parent folder):

- [../agentic-control-plane-kit/DOCS-INDEX.md](../agentic-control-plane-kit/DOCS-INDEX.md) — index across ACP repos
- [../agentic-control-plane-kit/THREE-REPO-CANONICAL-MODEL.md](../agentic-control-plane-kit/THREE-REPO-CANONICAL-MODEL.md) — three-repo model

Use **this** file (`DOCS-INDEX.md` here) as the entry point for **edge-bot–only** runtime and deployment docs.

## Canonical ACP Docs

For cross-repo ACP architecture, use the canonical docs in Repo A:

- [../agentic-control-plane-kit/DOCS-INDEX.md](../agentic-control-plane-kit/DOCS-INDEX.md)
- [../agentic-control-plane-kit/THREE-REPO-CANONICAL-MODEL.md](../agentic-control-plane-kit/THREE-REPO-CANONICAL-MODEL.md)

## This Repo Owns

These files should describe `edge-bot` behavior only:

- [deploy/README.md](./deploy/README.md)
- [docs/JOBS_AND_WAKE_REFERENCE.md](./docs/JOBS_AND_WAKE_REFERENCE.md)
- [docs/AGENT_VAULT.md](./docs/AGENT_VAULT.md)
- [docs/AGENT_LEARNINGS_SCHEMA.md](./docs/AGENT_LEARNINGS_SCHEMA.md)
- [docs/RELATIONAL_MEMORY_MODEL.md](./docs/RELATIONAL_MEMORY_MODEL.md)
- [docs/AGENT_MEMORY_POLICY.md](./docs/AGENT_MEMORY_POLICY.md)
- [docs/WORKER_DAEMON.md](./docs/WORKER_DAEMON.md)
- [deploy/RAILWAY_SKILLS_AND_LEARNINGS.md](./deploy/RAILWAY_SKILLS_AND_LEARNINGS.md)
- [SMS_REPLY_IMPLEMENTATION_NOTES.md](./SMS_REPLY_IMPLEMENTATION_NOTES.md) (SMS jobs + `echelon-agent-worker.mjs`)
- [TWILIO_SETUP_CURL_COMMANDS.md](./TWILIO_SETUP_CURL_COMMANDS.md) (tenant / connector setup curls)

## Scope Rule

`edge-bot` docs should focus on:

- Railway and Docker deployment
- hosted runtime packaging
- worker polling, wake hooks, and runtime operations
- local workspace/runtime conventions

`edge-bot` docs should not be treated as the canonical ACP architecture reference.

## Drift Rule

If an `edge-bot` doc conflicts with this repo's code or deployment scripts, the code and scripts in this repo are the source of truth.
