# Edge Bot Docs Index

This repo owns hosted runtime and deployment documentation for `edge-bot`.

## Canonical ACP Docs

For cross-repo ACP architecture, use the canonical docs in Repo A:

- [../agentic-control-plane-kit/DOCS-INDEX.md](../agentic-control-plane-kit/DOCS-INDEX.md)
- [../agentic-control-plane-kit/THREE-REPO-CANONICAL-MODEL.md](../agentic-control-plane-kit/THREE-REPO-CANONICAL-MODEL.md)

## This Repo Owns

These files should describe `edge-bot` behavior only:

- [deploy/README.md](./deploy/README.md)
- [docs/JOBS_AND_WAKE_REFERENCE.md](./docs/JOBS_AND_WAKE_REFERENCE.md)
- [docs/AGENT_VAULT.md](./docs/AGENT_VAULT.md)
- [docs/WORKER_DAEMON.md](./docs/WORKER_DAEMON.md)
- [deploy/RAILWAY_SKILLS_AND_LEARNINGS.md](./deploy/RAILWAY_SKILLS_AND_LEARNINGS.md)

## Scope Rule

`edge-bot` docs should focus on:

- Railway and Docker deployment
- hosted runtime packaging
- worker polling, wake hooks, and runtime operations
- local workspace/runtime conventions

`edge-bot` docs should not be treated as the canonical ACP architecture reference.

## Drift Rule

If an `edge-bot` doc conflicts with this repo's code or deployment scripts, the code and scripts in this repo are the source of truth.
