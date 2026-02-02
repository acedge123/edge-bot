# edge-bot OpenClaw Workspace

Version-controlled workspace and skills for the OpenClaw agent **edge-bot**. Use this repo to:

- **Version** SOUL, USER, TOOLS, IDENTITY, and other agent instructions
- **Review** changes to `.md` files before they affect the agent
- **Sync** the same personality/setup across machines or backups

## What’s in this repo

| Path | Purpose |
|------|--------|
| `workspace/` | Agent prompt files (SOUL, USER, TOOLS, AGENTS, IDENTITY, HEARTBEAT, BOOTSTRAP) |
| `openclaw.example.json` | Example config structure (no secrets) |
| `.gitignore` | Excludes `.env`, `openclaw.json`, credentials, runtime data |

**Not in this repo (by design):** API keys, tokens, `openclaw.json` with real credentials, memory DB, session data. Those stay in `~/.openclaw/` on your machine.

## How to use with OpenClaw

### Option A: Point OpenClaw at this repo’s workspace

1. Clone this repo where you want (e.g. `~/OpenClaw_Github`).
2. In `~/.openclaw/openclaw.json`, set the agent workspace to this folder’s `workspace`:
   ```json
   "agents": {
     "defaults": {
       "workspace": "/path/to/OpenClaw_Github/workspace"
     }
   }
   ```
3. Restart the gateway: `openclaw gateway restart`.

The agent will use the `.md` files from this repo. Edit them here, commit, and push for versioning.

### Option B: Copy into ~/.openclaw/workspace

1. Clone this repo.
2. Copy `workspace/*` into `~/.openclaw/workspace/` when you want to update:
   ```bash
   cp -r OpenClaw_Github/workspace/* ~/.openclaw/workspace/
   ```
3. Keep using `~/.openclaw/workspace` as the agent’s workspace; use the repo only for versioning and review.

## Workflow

1. Edit `workspace/*.md` in this repo (or in `~/.openclaw/workspace` then copy here).
2. Commit and push to GitHub for history and review.
3. If using Option A, the agent picks up changes after a gateway restart (or when the workspace is reloaded). If using Option B, run the `cp` command and restart as needed.

## Adding new skills / instructions

- **Agent personality and rules:** Edit `workspace/SOUL.md`, `workspace/IDENTITY.md`.
- **User context:** Edit `workspace/USER.md`.
- **API patterns, device names, local notes:** Edit `workspace/TOOLS.md`.
- **Session and memory rules:** Edit `workspace/AGENTS.md`, `workspace/HEARTBEAT.md`.

Commit and push after changes so everything stays versioned and reviewable.
